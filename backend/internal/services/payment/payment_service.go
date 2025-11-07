package payment

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/rand"
	"time"

	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/models"

	razorpay "github.com/razorpay/razorpay-go"
	"github.com/stripe/stripe-go/v76"
	"github.com/stripe/stripe-go/v76/paymentintent"
	"github.com/stripe/stripe-go/v76/webhook"
	"gorm.io/gorm"
)

type PaymentService struct {
	db            *gorm.DB
	stripeKey     string
	razorpayKeyID string
	razorpayKeySecret string
}

func NewPaymentService(db *gorm.DB, cfg *config.Config) *PaymentService {
	return &PaymentService{
		db:                db,
		stripeKey:         cfg.StripeSecretKey,
		razorpayKeyID:     cfg.RazorpayKeyID,
		razorpayKeySecret: cfg.RazorpayKeySecret,
	}
}

// CalculateCost calculates the cost based on word count and model used
func (s *PaymentService) CalculateCost(wordCount int, modelType models.ModelType) float64 {
	var costPer500Words float64
	
	switch modelType {
	case models.ModelA:
		costPer500Words = 10.0 // ₹10 per 500 words
	case models.ModelB:
		costPer500Words = 20.0 // ₹20 per 500 words
	default:
		costPer500Words = 10.0
	}
	
	// Calculate cost (round up to nearest 500 words)
	blocks := float64(wordCount) / 500.0
	if wordCount%500 != 0 {
		blocks += 1
	}
	
	return costPer500Words * blocks
}

// CreateStripePaymentIntent creates a Stripe payment intent
func (s *PaymentService) CreateStripePaymentIntent(amount float64, currency string, metadata map[string]string) (*stripe.PaymentIntent, error) {
	stripe.Key = s.stripeKey
	
	// Convert to cents (Stripe uses smallest currency unit)
	amountInCents := int64(amount * 100)
	
	params := &stripe.PaymentIntentParams{
		Amount:   stripe.Int64(amountInCents),
		Currency: stripe.String(currency),
		Metadata: metadata,
	}
	
	intent, err := paymentintent.New(params)
	if err != nil {
		return nil, err
	}
	
	return intent, nil
}

// CreateRazorpayOrder creates a Razorpay order
func (s *PaymentService) CreateRazorpayOrder(amount float64, currency string, metadata map[string]string) (map[string]interface{}, error) {
	client := razorpay.NewClient(s.razorpayKeyID, s.razorpayKeySecret)
	
	// Convert to paise (Razorpay uses smallest currency unit)
	amountInPaise := int(amount * 100)
	
	data := map[string]interface{}{
		"amount":   amountInPaise,
		"currency": currency,
		"receipt":  metadata["receipt"],
		"notes":    metadata,
	}
	
	order, err := client.Order.Create(data, nil)
	if err != nil {
		return nil, err
	}
	
	return order, nil
}

// VerifyStripeWebhook verifies Stripe webhook signature (kept for compatibility but not used directly)
func (s *PaymentService) VerifyStripeWebhook(payload []byte, signature string, secret string) (*stripe.Event, error) {
	event, err := webhook.ConstructEvent(payload, signature, secret)
	if err != nil {
		return nil, err
	}
	return event, nil
}

// VerifyRazorpayWebhook verifies Razorpay webhook signature
func (s *PaymentService) VerifyRazorpayWebhook(payload []byte, signature string) bool {
	mac := hmac.New(sha256.New, []byte(s.razorpayKeySecret))
	mac.Write(payload)
	expectedSignature := hex.EncodeToString(mac.Sum(nil))
	
	return hmac.Equal([]byte(expectedSignature), []byte(signature))
}

// CreatePaymentRecord creates a payment record in database
func (s *PaymentService) CreatePaymentRecord(userID uint, amount float64, currency string, paymentMethod models.PaymentMethod, paymentType models.PaymentType, gatewayPaymentID string, description string) (*models.Payment, error) {
	payment := &models.Payment{
		UserID:          userID,
		Amount:          amount,
		Currency:        currency,
		Status:          models.PaymentStatusPending,
		PaymentMethod:   paymentMethod,
		PaymentType:     paymentType,
		TransactionID:   s.generateTransactionID(),
		GatewayPaymentID: gatewayPaymentID,
		InvoiceNumber:   s.generateInvoiceNumber(),
		Description:     description,
	}
	
	if err := s.db.Create(payment).Error; err != nil {
		return nil, err
	}
	
	return payment, nil
}

// UpdatePaymentStatus updates payment status
func (s *PaymentService) UpdatePaymentStatus(paymentID uint, status models.PaymentStatus, gatewayPaymentID string) error {
	payment := &models.Payment{}
	if err := s.db.First(payment, paymentID).Error; err != nil {
		return err
	}
	
	payment.Status = status
	if gatewayPaymentID != "" {
		payment.GatewayPaymentID = gatewayPaymentID
	}
	
	return s.db.Save(payment).Error
}

// GetPaymentByTransactionID retrieves payment by transaction ID
func (s *PaymentService) GetPaymentByTransactionID(transactionID string) (*models.Payment, error) {
	var payment models.Payment
	if err := s.db.Where("transaction_id = ?", transactionID).First(&payment).Error; err != nil {
		return nil, err
	}
	return &payment, nil
}

// GetPaymentByGatewayID retrieves payment by gateway payment ID
func (s *PaymentService) GetPaymentByGatewayID(gatewayPaymentID string) (*models.Payment, error) {
	var payment models.Payment
	if err := s.db.Where("gateway_payment_id = ?", gatewayPaymentID).First(&payment).Error; err != nil {
		return nil, err
	}
	return &payment, nil
}

func (s *PaymentService) generateTransactionID() string {
	timestamp := time.Now().Unix()
	random := rand.Intn(10000)
	return fmt.Sprintf("TXN%d%d", timestamp, random)
}

func (s *PaymentService) generateInvoiceNumber() string {
	timestamp := time.Now().Format("20060102")
	random := rand.Intn(10000)
	return fmt.Sprintf("INV-%s-%04d", timestamp, random)
}

// CheckSubscriptionStatus checks if user has active subscription
func (s *PaymentService) CheckSubscriptionStatus(userID uint) (bool, *models.SubscriptionPlan, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return false, nil, err
	}
	
	if user.Subscription == models.PlanFree {
		return false, &user.Subscription, nil
	}
	
	if user.SubscriptionEnd != nil && user.SubscriptionEnd.Before(time.Now()) {
		// Subscription expired
		user.Subscription = models.PlanFree
		s.db.Save(&user)
		return false, &user.Subscription, nil
	}
	
	return true, &user.Subscription, nil
}

// GetUserPayments retrieves all payments for a user
func (s *PaymentService) GetUserPayments(userID uint, limit, offset int) ([]models.Payment, int64, error) {
	var payments []models.Payment
	var total int64
	
	query := s.db.Where("user_id = ?", userID)
	
	if err := query.Model(&models.Payment{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	
	if err := query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&payments).Error; err != nil {
		return nil, 0, err
	}
	
	return payments, total, nil
}

