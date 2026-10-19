# Woodberry Sports

Production-style full-stack cricket store built for Render + MongoDB.

## Included
- MongoDB-backed products, users, saved addresses, reviews, orders and notifications
- Customer sign up, sign in and account deletion
- Admin panel at `/admin` with product CRUD, original-byte image uploads via MongoDB GridFS, order updates and review moderation
- COD checkout and Razorpay online checkout when `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are configured
- PIN-code location lookup
- Dark/light mode, responsive design and SVG interface icons
- Woodberry Sports copyright overlays on product images without modifying the stored image bytes
- Developer credit: Swastik Shukla

## Render environment
Set `MONGODB_URI`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `ADMIN_EMAIL` (optional but recommended), `CONTACT_EMAIL`, `WHATSAPP_NUMBER=918178271170`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `SITE_URL`.

Build command: `npm install`  
Start command: `npm start`

On a brand-new database, the app can import the existing Woodberry bat images from the previous Vercel preview into MongoDB GridFS. Future admin uploads are stored as original bytes and are not recompressed.


## Email OTP with Resend

Set these Render environment variables:

- `RESEND_API` - your Resend API key (the app also accepts `RESEND_API_KEY`)
- `RESEND_FROM_EMAIL` - for production, use a sender on a domain you verified in Resend, e.g. `Woodberry Sports <verify@woodberrycricket.com>`

New customer registration now requires a six-digit email OTP. Codes expire after 10 minutes, are rate-limited to one send per minute per email, and lock after repeated incorrect attempts. Password-reset OTP is also included.

Note: Resend's default `onboarding@resend.dev` sender is useful for testing, but production delivery to arbitrary customers requires a verified sending domain.

## Customer profile

Customers can upload a JPG/PNG/WebP profile photo (stored in MongoDB GridFS), edit their name and phone number, manage saved addresses, view orders, delete their profile photo, and permanently delete their account.

## Custom bat enquiries

The Custom Bat flow collects preferred weight, profile, handle, willow and notes, then opens a pre-filled WhatsApp consultation with Woodberry Sports. Custom specification and final price are intentionally confirmed directly over WhatsApp.
