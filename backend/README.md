# Tamil AI Proofreading Platform - Backend

## Getting Started

1. Install Go dependencies:
```bash
go mod download
```

2. Set up PostgreSQL database and update `.env`:
```
DATABASE_URL=postgres://user:password@localhost:5432/tamil_proofreading?sslmode=disable
PORT=8080
FRONTEND_URL=http://localhost:3000
JWT_SECRET=your-secret-key
OPENAI_API_KEY=your-openai-api-key
STRIPE_SECRET_KEY=your-stripe-secret-key
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret
```

3. Run migrations (auto-migrate on startup):
The application will automatically migrate the database schema on startup.

4. Run the server:
```bash
go run cmd/server/main.go
```

The server will start on port 8080.

## API Endpoints

### Auth
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `GET /api/v1/auth/me` - Get current user (protected)

### Submissions
- `POST /api/v1/submit` - Submit text for proofreading (protected)
- `GET /api/v1/submissions` - Get user submissions (protected)
- `GET /api/v1/submissions/:id` - Get submission by ID (protected)

### Payments
- `POST /api/v1/payments/create` - Create payment (protected)
- `POST /api/v1/payments/verify` - Verify payment (protected)
- `GET /api/v1/payments` - Get user payments (protected)

### Dashboard
- `GET /api/v1/dashboard/stats` - Get dashboard statistics (protected)
- `GET /api/v1/usage` - Get usage statistics (protected)

### Admin
- `GET /api/v1/admin/users` - Get all users (admin)
- `PUT /api/v1/admin/users/:id` - Update user (admin)
- `DELETE /api/v1/admin/users/:id` - Delete user (admin)
- `GET /api/v1/admin/payments` - Get all payments (admin)
- `GET /api/v1/admin/analytics` - Get analytics (admin)
- `GET /api/v1/admin/model-logs` - Get model logs (admin)

### Webhooks
- `POST /api/v1/webhooks/stripe` - Stripe webhook
- `POST /api/v1/webhooks/razorpay` - Razorpay webhook

## Tech Stack

- Go 1.21+
- Gin (web framework)
- GORM (ORM)
- PostgreSQL
- JWT (authentication)
- Stripe & Razorpay (payments)
- OpenAI API (LLM)

## Project Structure

```
backend/
├── cmd/
│   └── server/
│       └── main.go          # Application entry point
├── internal/
│   ├── config/              # Configuration
│   ├── handlers/            # HTTP handlers
│   ├── middleware/          # Middleware (auth, CORS, rate limiting)
│   ├── models/              # Database models
│   └── services/            # Business logic
│       ├── auth/            # Authentication service
│       ├── llm/             # LLM service
│       ├── nlp/             # Tamil NLP service
│       └── payment/         # Payment service
└── migrations/              # Database migrations
```

