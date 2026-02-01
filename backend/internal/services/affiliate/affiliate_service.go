package affiliate

import (
	"crypto/rand"
	"errors"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/gorm"
)

const (
	// DefaultCommissionRate is 25%
	DefaultCommissionRate = 0.25
	// ReferredUserDiscount is 10%
	ReferredUserDiscount = 0.10
	// DiscountDurationMonths is how long referred users get a discount
	DiscountDurationMonths = 3
	// CommissionDurationMonths is how long affiliates earn commission per user
	CommissionDurationMonths = 12
	// RefundVoidDays is the window after which refunds don't void commission
	RefundVoidDays = 14
	// AffiliateCodeLength is the length of generated codes
	AffiliateCodeLength = 8
)

var (
	ErrAffiliateNotFound    = errors.New("affiliate not found")
	ErrUserNotFound         = errors.New("user not found")
	ErrUserAlreadyAffiliate = errors.New("user is already an affiliate")
	ErrInvalidCode          = errors.New("invalid affiliate code")
	ErrSelfReferral         = errors.New("self-referral not allowed")
	ErrAlreadyReferred      = errors.New("user already has a referral")
	ErrAffiliateInactive    = errors.New("affiliate is not active")
)

// AffiliateService handles all affiliate-related business logic
type AffiliateService struct {
	db *gorm.DB
}

// NewAffiliateService creates a new affiliate service
func NewAffiliateService(db *gorm.DB) *AffiliateService {
	return &AffiliateService{db: db}
}

// GenerateAffiliateCode creates a unique, URL-safe affiliate code
func (s *AffiliateService) GenerateAffiliateCode() (string, error) {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // Avoid confusing chars (0, O, 1, I)
	
	for attempt := 0; attempt < 10; attempt++ {
		code := make([]byte, AffiliateCodeLength)
		for i := range code {
			n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
			if err != nil {
				return "", fmt.Errorf("failed to generate random code: %w", err)
			}
			code[i] = charset[n.Int64()]
		}
		
		codeStr := string(code)
		
		// Check uniqueness
		var count int64
		if err := s.db.Model(&models.Affiliate{}).Where("UPPER(affiliate_code) = ?", codeStr).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return codeStr, nil
		}
	}
	
	return "", errors.New("failed to generate unique affiliate code after 10 attempts")
}

// CreateAffiliate marks an existing user as an affiliate (ADMIN ONLY)
func (s *AffiliateService) CreateAffiliate(adminUserID, targetUserID uint, commissionRate *float64) (*models.Affiliate, error) {
	// Verify target user exists
	var user models.User
	if err := s.db.First(&user, targetUserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	
	// Check if already an affiliate
	var existingCount int64
	if err := s.db.Model(&models.Affiliate{}).Where("user_id = ?", targetUserID).Count(&existingCount).Error; err != nil {
		return nil, err
	}
	if existingCount > 0 {
		return nil, ErrUserAlreadyAffiliate
	}
	
	// Generate affiliate code
	code, err := s.GenerateAffiliateCode()
	if err != nil {
		return nil, err
	}
	
	// Set commission rate (default 25%)
	rate := DefaultCommissionRate
	if commissionRate != nil && *commissionRate > 0 && *commissionRate <= 1.0 {
		rate = *commissionRate
	}
	
	// Create affiliate
	affiliate := &models.Affiliate{
		UserID:         targetUserID,
		AffiliateCode:  code,
		CommissionRate: rate,
		Status:         models.AffiliateStatusActive,
	}
	
	if err := s.db.Create(affiliate).Error; err != nil {
		return nil, err
	}
	
	// Log admin action
	s.logAudit(adminUserID, affiliate.ID, "created", "", fmt.Sprintf("code=%s, rate=%.2f", code, rate), "", "")
	
	log.Printf("[AFFILIATE] Created affiliate for user %d: code=%s rate=%.2f", targetUserID, code, rate)
	
	return affiliate, nil
}

// RegenerateCode generates a new code for an existing affiliate (ADMIN ONLY)
func (s *AffiliateService) RegenerateCode(adminUserID, affiliateID uint) (*models.Affiliate, error) {
	var affiliate models.Affiliate
	if err := s.db.First(&affiliate, affiliateID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAffiliateNotFound
		}
		return nil, err
	}
	
	oldCode := affiliate.AffiliateCode
	
	// Generate new code
	newCode, err := s.GenerateAffiliateCode()
	if err != nil {
		return nil, err
	}
	
	affiliate.AffiliateCode = newCode
	if err := s.db.Save(&affiliate).Error; err != nil {
		return nil, err
	}
	
	// Log admin action
	s.logAudit(adminUserID, affiliate.ID, "code_regenerated", oldCode, newCode, "", "")
	
	log.Printf("[AFFILIATE] Regenerated code for affiliate %d: %s -> %s", affiliateID, oldCode, newCode)
	
	return &affiliate, nil
}

// UpdateStatus changes affiliate status (ADMIN ONLY)
func (s *AffiliateService) UpdateStatus(adminUserID, affiliateID uint, status models.AffiliateStatus) error {
	var affiliate models.Affiliate
	if err := s.db.First(&affiliate, affiliateID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrAffiliateNotFound
		}
		return err
	}
	
	oldStatus := string(affiliate.Status)
	affiliate.Status = status
	
	if err := s.db.Save(&affiliate).Error; err != nil {
		return err
	}
	
	// Log admin action
	s.logAudit(adminUserID, affiliate.ID, "status_changed", oldStatus, string(status), "", "")
	
	log.Printf("[AFFILIATE] Status changed for affiliate %d: %s -> %s", affiliateID, oldStatus, status)
	
	return nil
}

// GetAffiliateByCode finds an affiliate by their code (case-insensitive)
func (s *AffiliateService) GetAffiliateByCode(code string) (*models.Affiliate, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return nil, ErrInvalidCode
	}
	
	var affiliate models.Affiliate
	if err := s.db.Where("UPPER(affiliate_code) = ?", code).First(&affiliate).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAffiliateNotFound
		}
		return nil, err
	}
	
	return &affiliate, nil
}

// GetAffiliateByUserID finds an affiliate by their user ID
func (s *AffiliateService) GetAffiliateByUserID(userID uint) (*models.Affiliate, error) {
	var affiliate models.Affiliate
	if err := s.db.Where("user_id = ?", userID).First(&affiliate).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAffiliateNotFound
		}
		return nil, err
	}
	return &affiliate, nil
}

// TrackReferral creates a referral record when a user signs up with an affiliate code
// Returns nil if no referral code was provided
func (s *AffiliateService) TrackReferral(newUserID uint, newUserEmail string, affiliateCode string) error {
	if affiliateCode == "" {
		return nil // No referral to track
	}
	
	affiliateCode = strings.ToUpper(strings.TrimSpace(affiliateCode))
	
	// Find the affiliate
	affiliate, err := s.GetAffiliateByCode(affiliateCode)
	if err != nil {
		if errors.Is(err, ErrAffiliateNotFound) {
			log.Printf("[AFFILIATE] Invalid referral code used: %s", affiliateCode)
			return nil // Invalid code, but don't fail signup
		}
		return err
	}
	
	// Check if affiliate is active
	if affiliate.Status != models.AffiliateStatusActive {
		log.Printf("[AFFILIATE] Inactive affiliate code used: %s", affiliateCode)
		return nil
	}
	
	// Prevent self-referral
	if affiliate.UserID == newUserID {
		log.Printf("[AFFILIATE] Self-referral attempt blocked: user %d", newUserID)
		return ErrSelfReferral
	}
	
	// Check if affiliate's email matches new user's email
	var affiliateUser models.User
	if err := s.db.First(&affiliateUser, affiliate.UserID).Error; err == nil {
		if strings.EqualFold(affiliateUser.Email, newUserEmail) {
			log.Printf("[AFFILIATE] Self-referral attempt blocked (same email): %s", newUserEmail)
			return ErrSelfReferral
		}
	}
	
	// Check if user already has a referral (shouldn't happen, but guard against it)
	var existingReferral models.Referral
	if err := s.db.Where("referred_user_id = ?", newUserID).First(&existingReferral).Error; err == nil {
		return ErrAlreadyReferred
	}
	
	// Create referral record
	referral := &models.Referral{
		AffiliateID:    affiliate.ID,
		ReferredUserID: newUserID,
		SignupDate:     time.Now(),
		Status:         models.ReferralStatusPending,
	}
	
	if err := s.db.Create(referral).Error; err != nil {
		return err
	}
	
	// Update user's referral fields
	if err := s.db.Model(&models.User{}).Where("id = ?", newUserID).Updates(map[string]interface{}{
		"referred_by_user_id":  affiliate.UserID,
		"affiliate_code_used":  affiliateCode,
	}).Error; err != nil {
		log.Printf("[AFFILIATE] Warning: Failed to update user referral fields: %v", err)
	}
	
	log.Printf("[AFFILIATE] Referral tracked: user %d referred by affiliate %d (code: %s)", newUserID, affiliate.ID, affiliateCode)
	
	return nil
}

// RecordCommission creates a commission entry after a successful payment
func (s *AffiliateService) RecordCommission(payment *models.Payment) error {
	// Only process completed payments
	if payment.Status != models.PaymentStatusCompleted {
		return nil
	}
	
	// Find if this user was referred
	var referral models.Referral
	if err := s.db.Where("referred_user_id = ?", payment.UserID).First(&referral).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil // User wasn't referred, no commission
		}
		return err
	}
	
	// Get affiliate
	var affiliate models.Affiliate
	if err := s.db.First(&affiliate, referral.AffiliateID).Error; err != nil {
		return err
	}
	
	// Check if commission period is still active (12 months from first payment)
	if referral.CommissionEndDate != nil && time.Now().After(*referral.CommissionEndDate) {
		log.Printf("[AFFILIATE] Commission period ended for referral %d", referral.ID)
		return nil
	}
	
	// Update referral status and dates if this is the first payment
	if referral.Status == models.ReferralStatusPending {
		now := time.Now()
		commissionEnd := now.AddDate(0, CommissionDurationMonths, 0)
		discountEnd := now.AddDate(0, DiscountDurationMonths, 0)
		
		referral.Status = models.ReferralStatusActive
		referral.FirstPaymentDate = &now
		referral.CommissionEndDate = &commissionEnd
		referral.DiscountEndDate = &discountEnd
		
		if err := s.db.Save(&referral).Error; err != nil {
			log.Printf("[AFFILIATE] Warning: Failed to update referral dates: %v", err)
		}
	}
	
	// Calculate commission
	commissionAmount := payment.Amount * affiliate.CommissionRate
	earningMonth := time.Now().Format("2006-01") // YYYY-MM format
	
	// Create commission entry (ledger-style, immutable)
	earning := &models.AffiliateEarning{
		AffiliateID:    affiliate.ID,
		ReferredUserID: payment.UserID,
		PaymentID:      payment.ID,
		Amount:         commissionAmount,
		Currency:       payment.Currency,
		EarningMonth:   earningMonth,
		Status:         models.EarningStatusPending,
	}
	
	if err := s.db.Create(earning).Error; err != nil {
		return err
	}
	
	// Update affiliate totals
	affiliate.TotalEarnings += commissionAmount
	if err := s.db.Save(&affiliate).Error; err != nil {
		log.Printf("[AFFILIATE] Warning: Failed to update affiliate totals: %v", err)
	}
	
	log.Printf("[AFFILIATE] Commission recorded: %.2f %s for affiliate %d from payment %d",
		commissionAmount, payment.Currency, affiliate.ID, payment.ID)
	
	return nil
}

// VoidCommission voids a commission if payment is refunded within the void period
func (s *AffiliateService) VoidCommission(paymentID uint, reason string) error {
	var earning models.AffiliateEarning
	if err := s.db.Where("payment_id = ?", paymentID).First(&earning).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil // No commission to void
		}
		return err
	}
	
	// Only void if still pending
	if earning.Status != models.EarningStatusPending {
		return nil
	}
	
	// Check if within void period (14 days)
	if time.Since(earning.CreatedAt) > time.Duration(RefundVoidDays)*24*time.Hour {
		log.Printf("[AFFILIATE] Commission %d not voided - outside void period", earning.ID)
		return nil
	}
	
	now := time.Now()
	earning.Status = models.EarningStatusVoided
	earning.VoidedAt = &now
	earning.VoidReason = reason
	
	if err := s.db.Save(&earning).Error; err != nil {
		return err
	}
	
	// Update affiliate totals
	var affiliate models.Affiliate
	if err := s.db.First(&affiliate, earning.AffiliateID).Error; err == nil {
		affiliate.TotalEarnings -= earning.Amount
		s.db.Save(&affiliate)
	}
	
	log.Printf("[AFFILIATE] Commission %d voided: %s", earning.ID, reason)
	
	return nil
}

// GetAffiliateStats returns statistics for an affiliate
func (s *AffiliateService) GetAffiliateStats(affiliateID uint) (*models.AffiliateStats, error) {
	stats := &models.AffiliateStats{}
	
	// Count total signups
	s.db.Model(&models.Referral{}).Where("affiliate_id = ?", affiliateID).Count(&stats.TotalSignups)
	
	// Count paid vs free users
	s.db.Model(&models.Referral{}).Where("affiliate_id = ? AND status = ?", affiliateID, models.ReferralStatusActive).Count(&stats.PaidUsers)
	stats.FreeUsers = stats.TotalSignups - stats.PaidUsers
	
	// Calculate commission totals
	s.db.Model(&models.AffiliateEarning{}).
		Where("affiliate_id = ? AND status != ?", affiliateID, models.EarningStatusVoided).
		Select("COALESCE(SUM(amount), 0)").
		Scan(&stats.TotalCommission)
	
	s.db.Model(&models.AffiliateEarning{}).
		Where("affiliate_id = ? AND status = ?", affiliateID, models.EarningStatusPending).
		Select("COALESCE(SUM(amount), 0)").
		Scan(&stats.PendingCommission)
	
	s.db.Model(&models.AffiliateEarning{}).
		Where("affiliate_id = ? AND status = ?", affiliateID, models.EarningStatusPaid).
		Select("COALESCE(SUM(amount), 0)").
		Scan(&stats.PaidCommission)
	
	return stats, nil
}

// GetMonthlyEarnings returns earnings breakdown by month
func (s *AffiliateService) GetMonthlyEarnings(affiliateID uint, months int) ([]models.MonthlyEarning, error) {
	if months <= 0 {
		months = 12
	}
	
	var results []models.MonthlyEarning
	
	err := s.db.Model(&models.AffiliateEarning{}).
		Where("affiliate_id = ? AND status != ?", affiliateID, models.EarningStatusVoided).
		Select("earning_month as month, SUM(amount) as amount, COUNT(*) as transaction_count").
		Group("earning_month").
		Order("earning_month DESC").
		Limit(months).
		Scan(&results).Error
	
	if err != nil {
		return nil, err
	}
	
	return results, nil
}

// ListAffiliates returns all affiliates with their stats (ADMIN ONLY)
func (s *AffiliateService) ListAffiliates(page, limit int) ([]models.Affiliate, int64, error) {
	if page <= 0 {
		page = 1
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit
	
	var affiliates []models.Affiliate
	var total int64
	
	s.db.Model(&models.Affiliate{}).Count(&total)
	
	err := s.db.Preload("User").
		Order("created_at DESC").
		Offset(offset).
		Limit(limit).
		Find(&affiliates).Error
	
	if err != nil {
		return nil, 0, err
	}
	
	return affiliates, total, nil
}

// CheckReferralDiscount checks if a user is eligible for a referral discount
func (s *AffiliateService) CheckReferralDiscount(userID uint) (bool, float64) {
	var referral models.Referral
	if err := s.db.Where("referred_user_id = ?", userID).First(&referral).Error; err != nil {
		return false, 0
	}
	
	// Check if discount period is still active
	if referral.DiscountEndDate == nil {
		// Not yet paid, so no discount period started
		return true, ReferredUserDiscount
	}
	
	if time.Now().Before(*referral.DiscountEndDate) {
		return true, ReferredUserDiscount
	}
	
	return false, 0
}

// logAudit creates an audit log entry
func (s *AffiliateService) logAudit(adminUserID, affiliateID uint, action, oldValue, newValue, ip, userAgent string) {
	log := &models.AffiliateAuditLog{
		AdminUserID: adminUserID,
		AffiliateID: affiliateID,
		Action:      action,
		OldValue:    oldValue,
		NewValue:    newValue,
		IPAddress:   ip,
		UserAgent:   userAgent,
	}
	s.db.Create(log)
}
