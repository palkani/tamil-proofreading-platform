# Tamil AI Proofreading Platform

A web-based platform that enables Tamil writers to upload text for AI-assisted proofreading. The system uses a tiered model workflow: a lightweight model handles up to a word limit, and escalates to a deeper model for longer or complex texts. Users access services via secure login and pay per use or via .

## Features

### Core Features

- **User Authentication**: Secure login via email/password, OTP, and social login (Google, Facebook)
- **Text Submission**: Upload or paste Tamil text for proofreading
- **Tiered Model Workflow**:
  - Model A: Handles up to 500 words (fast, basic grammar/spelling)
  - Model B: Handles 500+ words (deep syntax, semantic checks)
- **Payment Integration**: Stripe and Razorpay support for global and Indian users
- **Pay-per-use**: ₹10 per 500 words (Model A), ₹20 per 500 words (Model B)
- **Subscription Plans**: Monthly/Yearly tiers with usage limits
- **Dashboard**: Submission history, word usage tracker, payment status, model usage breakdown
- **Admin Panel**: User management, model performance logs, payment reconciliation, analytics

## Tech Stack

### Backend
- **Go 1.21+** with Gin framework
- **PostgreSQL** with GORM
- **JWT** for authentication
- **Stripe & Razorpay** for payments
- **OpenAI API** for LLM integration

### Frontend
- **Next.js 14** with React 19
- **TypeScript**
- **Tailwind CSS**
- **Recharts** for data visualization
- **Axios** for API calls

## Project Structure

```
tamil-proofreading-platform/
├── backend/                 # Go API server
│   ├── cmd/server/         # Application entry point
│   ├── internal/
│   │   ├── config/         # Configuration
│   │   ├── handlers/       # HTTP handlers
│   │   ├── middleware/     # Auth, CORS, rate limiting, sanitization
│   │   ├── models/         # Database models
│   │   └── services/       # Business logic
│   │       ├── auth/       # Authentication service
│   │       ├── llm/        # LLM service
│   │       ├── nlp/        # Tamil NLP service
│   │       └── payment/    # Payment service
│   └── migrations/         # Database migrations
├── frontend/               # Next.js app
│   ├── app/               # App router pages
│   │   ├── (auth)/        # Auth pages
│   │   ├── dashboard/     # User dashboard
│   │   ├── submit/        # Text submission
│   │   ├── admin/         # Admin panel
│   │   └── payment/       # Payment page
│   ├── components/        # React components
│   ├── lib/              # Utilities, API clients
│   └── types/            # TypeScript types
└── docs/                 # Documentation
```

## Getting Started

### Prerequisites

- Go 1.21 or higher
- Node.js 18 or higher
- PostgreSQL 12 or higher
- OpenAI API key
- Stripe account (optional)
- Razorpay account (optional)

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
go mod download
```

3. Set up environment variables (copy `.env.example` to `.env`):
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
```
DATABASE_URL=postgres://user:password@localhost:5432/tamil_proofreading?sslmode=disable
PORT=8080
FRONTEND_URL=http://localhost:3000
JWT_SECRET=your-secret-key-change-in-production
OPENAI_API_KEY=your-openai-api-key
STRIPE_SECRET_KEY=your-stripe-secret-key
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret
```

5. Run the server:
```bash
go run cmd/server/main.go
```

The server will start on port 8080 and automatically migrate the database schema.

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables (copy `.env.example` to `.env.local`):
```bash
cp .env.example .env.local
```

4. Update `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_RAZORPAY_KEY_ID=your-razorpay-key-id
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Documentation

### Authentication
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

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: 100 requests per minute per IP
- **Input Sanitization**: XSS protection for user inputs
- **CORS Protection**: Configurable CORS middleware
- **Password Hashing**: bcrypt for password storage
- **Role-Based Access Control**: Writer, Reviewer, Admin roles

## Pricing Model

- **Pay-per-use**: ₹10 per 500 words (Model A), ₹20 per 500 words (Model B)
- **Subscription Plans**:
  - Basic: ₹500/month - 10,000 words (Model A)
  - Pro: ₹1500/month - 50,000 words (Model B)
  - Enterprise: Custom pricing

## Deployment

### Backend
The backend can be deployed to:
- Railway
- Render
- Google Cloud Run
- AWS ECS
- Any platform supporting Go applications

### Frontend
The frontend can be deployed to:
- Vercel (recommended)
- Netlify
- AWS Amplify
- Any platform supporting Next.js

## License

This project is licensed under the MIT License.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For support, please open an issue on GitHub or contact the development team.

