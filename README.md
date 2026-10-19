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
