package auth

import (
        "crypto/rand"
        "crypto/sha256"
        "encoding/base64"
        "encoding/hex"
        "errors"
        "fmt"
        "math/big"
        "regexp"
        "strings"
        "time"
        "unicode"

        "tamil-proofreading-platform/backend/internal/models"

        "github.com/golang-jwt/jwt/v5"
        "golang.org/x/crypto/bcrypt"
        "gorm.io/gorm"
)

type SessionMetadata struct {
        UserAgent string
        IPAddress string
}

type TokenPair struct {
        AccessToken      string
        RefreshToken     string
        AccessExpiresAt  time.Time
        RefreshExpiresAt time.Time
}

type AuthService struct {
        db              *gorm.DB
        jwtSecret       string
        refreshSecret   string
        accessTokenTTL  time.Duration
        refreshTokenTTL time.Duration
}

func NewAuthService(db *gorm.DB, jwtSecret, refreshSecret string, accessTokenTTL, refreshTokenTTL time.Duration) *AuthService {
        if refreshSecret == "" {
                refreshSecret = jwtSecret
        }
        return &AuthService{
                db:              db,
                jwtSecret:       jwtSecret,
                refreshSecret:   refreshSecret,
                accessTokenTTL:  accessTokenTTL,
                refreshTokenTTL: refreshTokenTTL,
        }
}

// PasswordStrength represents the strength requirements result
type PasswordStrength struct {
        IsValid       bool     `json:"is_valid"`
        Score         int      `json:"score"`
        Errors        []string `json:"errors"`
        Suggestions   []string `json:"suggestions"`
}

// ValidatePasswordStrength checks if password meets strong requirements
func ValidatePasswordStrength(password string) PasswordStrength {
        result := PasswordStrength{
                IsValid:     true,
                Score:       0,
                Errors:      []string{},
                Suggestions: []string{},
        }

        // Minimum length check (8 characters)
        if len(password) < 8 {
                result.IsValid = false
                result.Errors = append(result.Errors, "Password must be at least 8 characters long")
        } else {
                result.Score += 1
        }

        // Maximum length check (128 characters)
        if len(password) > 128 {
                result.IsValid = false
                result.Errors = append(result.Errors, "Password must not exceed 128 characters")
        }

        // Check for uppercase letter
        hasUpper := false
        for _, c := range password {
                if unicode.IsUpper(c) {
                        hasUpper = true
                        break
                }
        }
        if !hasUpper {
                result.IsValid = false
                result.Errors = append(result.Errors, "Password must contain at least one uppercase letter")
        } else {
                result.Score += 1
        }

        // Check for lowercase letter
        hasLower := false
        for _, c := range password {
                if unicode.IsLower(c) {
                        hasLower = true
                        break
                }
        }
        if !hasLower {
                result.IsValid = false
                result.Errors = append(result.Errors, "Password must contain at least one lowercase letter")
        } else {
                result.Score += 1
        }

        // Check for digit
        hasDigit := false
        for _, c := range password {
                if unicode.IsDigit(c) {
                        hasDigit = true
                        break
                }
        }
        if !hasDigit {
                result.IsValid = false
                result.Errors = append(result.Errors, "Password must contain at least one number")
        } else {
                result.Score += 1
        }

        // Check for special character
        specialChars := regexp.MustCompile(`[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]`)
        if !specialChars.MatchString(password) {
                result.IsValid = false
                result.Errors = append(result.Errors, "Password must contain at least one special character (!@#$%^&*...)")
        } else {
                result.Score += 1
        }

        // Bonus for longer passwords
        if len(password) >= 12 {
                result.Score += 1
        }
        if len(password) >= 16 {
                result.Score += 1
        }

        // Add suggestions
        if result.Score < 5 {
                result.Suggestions = append(result.Suggestions, "Consider using a longer password with a mix of characters")
        }

        return result
}

// HashPassword hashes a plain text password
func (s *AuthService) HashPassword(password string) (string, error) {
        bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
        return string(bytes), err
}

// CheckPassword compares a password with a hash
func (s *AuthService) CheckPassword(password, hash string) bool {
        err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
        return err == nil
}

// GenerateOTP generates a 6-digit OTP code
func (s *AuthService) GenerateOTP() (string, error) {
        const digits = "0123456789"
        otp := make([]byte, 6)
        for i := range otp {
                n, err := rand.Int(rand.Reader, big.NewInt(int64(len(digits))))
                if err != nil {
                        return "", err
                }
                otp[i] = digits[n.Int64()]
        }
        return string(otp), nil
}

// CreateEmailVerification creates a new OTP for email verification
func (s *AuthService) CreateEmailVerification(userID uint, email string) (*models.EmailVerification, string, error) {
        // Delete any existing verification for this user
        s.db.Where("user_id = ? AND verified = ?", userID, false).Delete(&models.EmailVerification{})

        // Generate new OTP
        otp, err := s.GenerateOTP()
        if err != nil {
                return nil, "", err
        }

        // Hash the OTP for storage
        hashedOTP := sha256.Sum256([]byte(otp))
        hashedOTPStr := hex.EncodeToString(hashedOTP[:])

        verification := &models.EmailVerification{
                UserID:    userID,
                Email:     strings.ToLower(email),
                OTPCode:   hashedOTPStr,
                ExpiresAt: time.Now().Add(15 * time.Minute), // OTP valid for 15 minutes
                Verified:  false,
        }

        if err := s.db.Create(verification).Error; err != nil {
                return nil, "", err
        }

        return verification, otp, nil
}

// VerifyEmailOTP verifies the OTP and marks email as verified
func (s *AuthService) VerifyEmailOTP(userID uint, otp string) error {
        var verification models.EmailVerification
        if err := s.db.Where("user_id = ? AND verified = ?", userID, false).
                Order("created_at DESC").First(&verification).Error; err != nil {
                return errors.New("no pending verification found")
        }

        // Check if OTP has expired
        if time.Now().After(verification.ExpiresAt) {
                return errors.New("OTP has expired, please request a new one")
        }

        // Verify OTP
        hashedOTP := sha256.Sum256([]byte(otp))
        hashedOTPStr := hex.EncodeToString(hashedOTP[:])

        if verification.OTPCode != hashedOTPStr {
                return errors.New("invalid OTP code")
        }

        // Mark verification as complete
        verification.Verified = true
        if err := s.db.Save(&verification).Error; err != nil {
                return err
        }

        // Update user's EmailVerified status
        if err := s.db.Model(&models.User{}).Where("id = ?", userID).
                Update("email_verified", true).Error; err != nil {
                return err
        }

        return nil
}

// ResendEmailVerification creates a new OTP for email verification
func (s *AuthService) ResendEmailVerification(email string) (*models.EmailVerification, string, error) {
        var user models.User
        if err := s.db.Where("email = ?", strings.ToLower(email)).First(&user).Error; err != nil {
                return nil, "", errors.New("user not found")
        }

        if user.EmailVerified {
                return nil, "", errors.New("email already verified")
        }

        return s.CreateEmailVerification(user.ID, user.Email)
}

// Register creates a new user with password strength validation
func (s *AuthService) Register(email, password, name string) (*models.User, error) {
        // Validate password strength
        passwordCheck := ValidatePasswordStrength(password)
        if !passwordCheck.IsValid {
                return nil, fmt.Errorf("weak password: %s", strings.Join(passwordCheck.Errors, "; "))
        }

        var existingUser models.User
        if err := s.db.Where("email = ?", strings.ToLower(email)).First(&existingUser).Error; err == nil {
                return nil, errors.New("user already exists")
        }

        hashedPassword, err := s.HashPassword(password)
        if err != nil {
                return nil, err
        }

        user := &models.User{
                Email:         strings.ToLower(email),
                PasswordHash:  hashedPassword,
                Name:          name,
                Role:          models.RoleWriter,
                Subscription:  models.PlanFree,
                IsActive:      true,
                EmailVerified: false, // Will be verified via OTP
        }

        if err := s.db.Create(user).Error; err != nil {
                return nil, err
        }

        return user, nil
}

// Login authenticates a user credentials and returns the user if valid.
func (s *AuthService) Login(email, password string) (*models.User, error) {
        var user models.User
        if err := s.db.Where("email = ?", strings.ToLower(email)).First(&user).Error; err != nil {
                if errors.Is(err, gorm.ErrRecordNotFound) {
                        return nil, errors.New("invalid credentials")
                }
                return nil, err
        }

        if !user.IsActive {
                return nil, errors.New("account is inactive")
        }

        if !s.CheckPassword(password, user.PasswordHash) {
                return nil, errors.New("invalid credentials")
        }

        return &user, nil
}

func (s *AuthService) GenerateAccessToken(user *models.User) (string, time.Time, error) {
        expiresAt := time.Now().Add(s.accessTokenTTL)
        jti, err := s.generateTokenID()
        if err != nil {
                return "", time.Time{}, err
        }
        claims := jwt.MapClaims{
                "user_id": user.ID,
                "email":   user.Email,
                "role":    user.Role,
                "exp":     expiresAt.Unix(),
                "iat":     time.Now().Unix(),
                "jti":     jti,
        }

        token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
        signed, err := token.SignedString([]byte(s.jwtSecret))
        if err != nil {
                return "", time.Time{}, err
        }
        return signed, expiresAt, nil
}

func (s *AuthService) IssueSession(user *models.User, meta SessionMetadata) (*TokenPair, error) {
        accessToken, accessExpiry, err := s.GenerateAccessToken(user)
        if err != nil {
                return nil, err
        }

        refreshToken, refreshRecord, err := s.createRefreshToken(s.db, user.ID, meta)
        if err != nil {
                return nil, err
        }

        return &TokenPair{
                AccessToken:      accessToken,
                RefreshToken:     refreshToken,
                AccessExpiresAt:  accessExpiry,
                RefreshExpiresAt: refreshRecord.ExpiresAt,
        }, nil
}

func (s *AuthService) RefreshSession(rawToken string, meta SessionMetadata) (*TokenPair, *models.User, error) {
        tokenRecord, err := s.validateRefreshToken(rawToken)
        if err != nil {
                return nil, nil, err
        }

        var user models.User
        if err := s.db.First(&user, tokenRecord.UserID).Error; err != nil {
                return nil, nil, err
        }
        if !user.IsActive {
                return nil, nil, errors.New("account is inactive")
        }

        accessToken, accessExpiry, err := s.GenerateAccessToken(&user)
        if err != nil {
                return nil, nil, err
        }

        newRefreshRaw, newRefreshRecord, err := s.rotateRefreshToken(tokenRecord, meta)
        if err != nil {
                return nil, nil, err
        }

        return &TokenPair{
                AccessToken:      accessToken,
                RefreshToken:     newRefreshRaw,
                AccessExpiresAt:  accessExpiry,
                RefreshExpiresAt: newRefreshRecord.ExpiresAt,
        }, &user, nil
}

func (s *AuthService) RevokeRefreshToken(rawToken string) error {
        hash := s.hashRefreshToken(rawToken)
        if hash == "" {
                return errors.New("invalid refresh token")
        }

        now := time.Now()
        return s.db.Model(&models.RefreshToken{}).
                Where("token_hash = ? AND revoked_at IS NULL", hash).
                Update("revoked_at", now).Error
}

func (s *AuthService) createRefreshToken(db *gorm.DB, userID uint, meta SessionMetadata) (string, *models.RefreshToken, error) {
        raw, err := s.generateRefreshTokenString()
        if err != nil {
                return "", nil, err
        }

        record := &models.RefreshToken{
                UserID:    userID,
                TokenHash: s.hashRefreshToken(raw),
                UserAgent: truncate(meta.UserAgent, 255),
                IPAddress: truncate(meta.IPAddress, 64),
                ExpiresAt: time.Now().Add(s.refreshTokenTTL),
        }

        if err := db.Create(record).Error; err != nil {
                return "", nil, err
        }

        return raw, record, nil
}

func (s *AuthService) rotateRefreshToken(existing *models.RefreshToken, meta SessionMetadata) (string, *models.RefreshToken, error) {
        var (
                newRaw string
                newRec *models.RefreshToken
        )

        err := s.db.Transaction(func(tx *gorm.DB) error {
                now := time.Now()
                if err := tx.Model(&models.RefreshToken{}).
                        Where("id = ? AND revoked_at IS NULL", existing.ID).
                        Update("revoked_at", now).Error; err != nil {
                        return err
                }

                var err error
                newRaw, newRec, err = s.createRefreshToken(tx, existing.UserID, meta)
                return err
        })

        if err != nil {
                return "", nil, err
        }

        return newRaw, newRec, nil
}

func (s *AuthService) validateRefreshToken(rawToken string) (*models.RefreshToken, error) {
        if strings.TrimSpace(rawToken) == "" {
                return nil, errors.New("missing refresh token")
        }

        hash := s.hashRefreshToken(rawToken)
        if hash == "" {
                return nil, errors.New("invalid refresh token")
        }

        var token models.RefreshToken
        if err := s.db.Where("token_hash = ?", hash).First(&token).Error; err != nil {
                return nil, errors.New("refresh token not found")
        }

        if token.RevokedAt != nil {
                return nil, errors.New("refresh token revoked")
        }

        if time.Now().After(token.ExpiresAt) {
                _ = s.RevokeRefreshToken(rawToken)
                return nil, errors.New("refresh token expired")
        }

        return &token, nil
}

func (s *AuthService) generateRefreshTokenString() (string, error) {
        buf := make([]byte, 48)
        if _, err := rand.Read(buf); err != nil {
                return "", fmt.Errorf("failed generating refresh token: %w", err)
        }
        return base64.RawURLEncoding.EncodeToString(buf), nil
}

func (s *AuthService) hashRefreshToken(raw string) string {
        if raw == "" {
                return ""
        }
        sum := sha256.Sum256([]byte(s.refreshSecret + raw))
        return hex.EncodeToString(sum[:])
}

func (s *AuthService) generateTokenID() (string, error) {
        buf := make([]byte, 24)
        if _, err := rand.Read(buf); err != nil {
                return "", fmt.Errorf("failed generating token id: %w", err)
        }
        return base64.RawURLEncoding.EncodeToString(buf), nil
}

func (s *AuthService) generateRandomPassword() (string, error) {
        buf := make([]byte, 24)
        if _, err := rand.Read(buf); err != nil {
                return "", err
        }
        return base64.RawURLEncoding.EncodeToString(buf), nil
}

func (s *AuthService) EnsureOAuthUser(email, name string) (*models.User, error) {
        email = strings.ToLower(strings.TrimSpace(email))
        if email == "" {
                return nil, errors.New("email required")
        }

        var user models.User
        err := s.db.Where("email = ?", email).First(&user).Error
        if err == nil {
                return &user, nil
        }
        if !errors.Is(err, gorm.ErrRecordNotFound) {
                return nil, err
        }

        randomPassword, err := s.generateRandomPassword()
        if err != nil {
                return nil, err
        }

        hashed, err := s.HashPassword(randomPassword)
        if err != nil {
                return nil, err
        }

        displayName := strings.TrimSpace(name)
        if displayName == "" {
                if parts := strings.Split(email, "@"); len(parts) > 0 {
                        displayName = parts[0]
                } else {
                        displayName = "ProofTamil User"
                }
        }

        newUser := &models.User{
                Email:        email,
                PasswordHash: hashed,
                Name:         displayName,
                Role:         models.RoleWriter,
                Subscription: models.PlanFree,
                IsActive:     true,
        }

        if err := s.db.Create(newUser).Error; err != nil {
                return nil, err
        }

        return newUser, nil
}

func truncate(value string, max int) string {
        if len(value) <= max {
                return value
        }
        return value[:max]
}

// GetUserByID retrieves a user by ID
func (s *AuthService) GetUserByID(id uint) (*models.User, error) {
        var user models.User
        if err := s.db.First(&user, id).Error; err != nil {
                return nil, err
        }
        return &user, nil
}

// GetUserByEmail retrieves a user by email
func (s *AuthService) GetUserByEmail(email string) (*models.User, error) {
        var user models.User
        if err := s.db.Where("email = ?", strings.ToLower(email)).First(&user).Error; err != nil {
                return nil, err
        }
        return &user, nil
}

// UpdateUser updates user information
func (s *AuthService) UpdateUser(user *models.User) error {
        return s.db.Save(user).Error
}

// VerifyToken verifies a JWT token and returns the claims
func (s *AuthService) VerifyToken(tokenString string) (jwt.MapClaims, error) {
        token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
                if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
                        return nil, errors.New("unexpected signing method")
                }
                return []byte(s.jwtSecret), nil
        })

        if err != nil {
                return nil, err
        }

        if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
                return claims, nil
        }

        return nil, errors.New("invalid token")
}
