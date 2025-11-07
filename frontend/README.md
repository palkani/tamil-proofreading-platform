# Tamil AI Proofreading Platform - Frontend

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file:
```
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_RAZORPAY_KEY_ID=your-razorpay-key-id
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

- User authentication (login/register)
- Text submission for proofreading
- Dashboard with statistics
- Payment integration (Stripe/Razorpay)
- Admin panel
- Real-time submission status

## Tech Stack

- Next.js 14
- React 19
- TypeScript
- Tailwind CSS
- Recharts (for charts)
- Axios (for API calls)
