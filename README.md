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

## Order operations, tracking and rewards

New order alerts are sent through Resend to `ORDER_ALERT_EMAIL` (defaults to `jiking847@gmail.com`) and `ADMIN_EMAIL`. Configure a verified sender using `RESEND_FROM_EMAIL`. Email messages are best effort and cannot replace MongoDB as the source of truth for orders.

The authenticated administrator console supports order confirmation, rejection, fulfilment status, courier name/number/link and return decisions. Updates append order history and notify customers. Its JavaScript saves status in place without reloading the browser page. Rejected or cancelled COD orders release reserved stock.

For prepaid Razorpay orders, the separate **Initiate verified refund** action sends an actual refund request to Razorpay when merchant credentials and a verified payment exist. **Check refund** queries Razorpay. The store marks a refund complete only when Razorpay reports a processed refund. COD refunds require an administrator-entered completed refund reference and confirmation.

Admin stock controls record stock adjustment history, while product creation/editing supports multiple image uploads including drag-and-drop. Uploaded bytes are preserved in MongoDB GridFS.

Customer account tools include:
- Order history and manual courier tracking timeline
- Reports of bugs, order problems and product questions
- Coupons awarded manually by administrators for reports where appropriate
- Referral codes: verified referred customer receives ₹100 off; referrer receives ₹150 off
- One-time ₹100 profile-completion coupon for a verified account with name, phone, address and profile photo
- Coupon entry and validation at **COD** checkout (Razorpay coupon checkout is not enabled yet)
- A progress indicator for profile setup

Coupons are database-backed with limits and optional expiry/minimum order value. Do not advertise referral or profile discounts until real checkout tests have passed.

Admin account deletion requires a separate email OTP sent to `ADMIN_EMAIL` and a written reason. The site attempts to email the reason to the affected customer before deletion; it blocks deletion when email delivery is not accepted by Resend.

## Production checks still required

Test MongoDB connectivity from the deployed service, Resend's verified domain and delivery to real addresses, COD order and stock reservation, returns and order notifications, coupon redemption, and Razorpay test-mode refunds using a merchant sandbox. External courier status synchronization has **not** been implemented: tracking entries currently reflect administrator-entered status and courier details. The frontend catalogue can remain visible when the API is unavailable, but account and ordering workflows cannot.

**Important:** Production admin sign-in requires explicit `ADMIN_PASSWORD` and `SESSION_SECRET` environment variables. There is no public fallback password.
