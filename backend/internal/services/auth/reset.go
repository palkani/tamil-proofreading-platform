package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"time"

	"tamil-proofreading-platform/backend/internal/models"
	"gorm.io/gorm"
)

// GenerateResetToken generates a cryptographically secure random token
func (s *AuthService) GenerateResetToken() (string, error) {
	buf := make([]byte, 48)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("failed generating reset token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// HashResetToken hashes a reset token using SHA256
func (s *AuthService) HashResetToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

// CreatePasswordResetToken creates a new password reset token for a user
func (s *AuthService) CreatePasswordResetToken(email string) (*models.PasswordResetToken, string, error) {
	var user models.User
	if err := s.db.Where("email = ?", email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			log.Printf("[RESET] forgot password request for non-existent user: %s", email)
			return nil, "", nil // Don't reveal if user exists
		}
		return nil, "", err
	}

	// Revoke any existing unused tokens for this user
	now := time.Now()
	s.db.Model(&models.PasswordResetToken{}).
		Where("user_id = ? AND used_at IS NULL", user.ID).
		Update("used_at", now)

	// Generate new token
	rawToken, err := s.GenerateResetToken()
	if err != nil {
		return nil, "", err
	}

	// Hash token for storage
	tokenHash := s.HashResetToken(rawToken)

	// Create reset token record
	resetToken := &models.PasswordResetToken{
		UserID:    user.ID,
		TokenHash: tokenHash,
		ExpiresAt: time.Now().Add(1 * time.Hour),
	}

	if err := s.db.Create(resetToken).Error; err != nil {
		return nil, "", err
	}

	log.Printf("[RESET] password reset token created for user=%s", user.Email)

	return resetToken, rawToken, nil
}

// ValidateResetToken validates a reset token
func (s *AuthService) ValidateResetToken(rawToken string) (*models.PasswordResetToken, *models.User, error) {
	if rawToken == "" {
		return nil, nil, errors.New("token is required")
	}

	// Hash the provided token
	tokenHash := s.HashResetToken(rawToken)

	// Look up the token in database
	var resetToken models.PasswordResetToken
	if err := s.db.Where("token_hash = ?", tokenHash).First(&resetToken).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			log.Printf("[RESET] invalid reset token used")
			return nil, nil, errors.New("invalid or expired reset token")
		}
		return nil, nil, err
	}

	// Check if token is expired
	if time.Now().After(resetToken.ExpiresAt) {
		log.Printf("[RESET] expired reset token used for user_id=%d", resetToken.UserID)
		return nil, nil, errors.New("reset token has expired")
	}

	// Check if token has already been used
	if resetToken.UsedAt != nil {
		log.Printf("[RESET] already-used reset token attempted for user_id=%d", resetToken.UserID)
		return nil, nil, errors.New("reset token has already been used")
	}

	// Get user
	var user models.User
	if err := s.db.First(&user, resetToken.UserID).Error; err != nil {
		return nil, nil, errors.New("user not found")
	}

	return &resetToken, &user, nil
}

// ResetPassword resets a user's password using a valid reset token
func (s *AuthService) ResetPassword(rawToken, newPassword string) error {
	// Validate token and get user
	resetToken, user, err := s.ValidateResetToken(rawToken)
	if err != nil {
		return err
	}

	// Validate new password
	strength := ValidatePasswordStrength(newPassword)
	if !strength.IsValid {
		return fmt.Errorf("weak password: %s", strength.Errors[0])
	}

	// Hash new password
	hashedPassword, err := s.HashPassword(newPassword)
	if err != nil {
		return err
	}

	// Update password and mark token as used in a transaction
	err = s.db.Transaction(func(tx *gorm.DB) error {
		now := time.Now()

		// Update user password
		if err := tx.Model(&user).Update("password_hash", hashedPassword).Error; err != nil {
			return err
		}

		// Mark token as used
		if err := tx.Model(resetToken).Update("used_at", now).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return err
	}

	log.Printf("[RESET] password changed for user=%s", user.Email)
	return nil
}

// CleanupExpiredResetTokens removes expired reset tokens
func (s *AuthService) CleanupExpiredResetTokens() error {
	return s.db.Where("expires_at < ?", time.Now()).Delete(&models.PasswordResetToken{}).Error
}
