const express=require("express");
const path=require("path");
const crypto=require("crypto");
const cookieParser=require("cookie-parser");
const jwt=require("jsonwebtoken");
const bcrypt=require("bcryptjs");
const multer=require("multer");
const Razorpay=require("razorpay");
const {MongoClient,ObjectId,GridFSBucket}=require("mongodb");

const app=express(),PORT=Number(process.env.PORT||10000);
const URI=process.env.MONGODB_URI||process.env.MONGO_URL||process.env.MONGODB_URL;
const DB=process.env.MONGODB_DB||"woodberry";
const SECRET=process.env.SESSION_SECRET||process.env.JWT_SECRET||"change-me";
const ADMIN_EMAIL=(process.env.ADMIN_EMAIL||"admin@woodberrycricket.com").toLowerCase();
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"";

const ADMIN_ROUTE=(process.env.ADMIN_ROUTE||"/wb-control-7x91").startsWith("/")?(process.env.ADMIN_ROUTE||"/wb-control-7x91"):"/"+process.env.ADMIN_ROUTE;
const WHATSAPP=(process.env.WHATSAPP_NUMBER||"918178271170").replace(/\D/g,"");
const EMAIL=process.env.CONTACT_EMAIL||"";
const RESEND_API=process.env.RESEND_API||process.env.RESEND_API_KEY||"";
const RESEND_FROM=process.env.RESEND_FROM_EMAIL||"Woodberry Sports <onboarding@resend.dev>";
const RZ_ID=process.env.RAZORPAY_KEY_ID||"",RZ_SECRET=process.env.RAZORPAY_KEY_SECRET||"";
let client,db,bucket;

async function connect(){
 if(db)return db;
 if(!URI)throw Error("MONGODB_URI is missing");
 client=new MongoClient(URI,{maxPoolSize:10});await client.connect();db=client.db(DB);bucket=new GridFSBucket(db,{bucketName:"media"});
 await Promise.all([
  db.collection("users").createIndex({email:1},{unique:true}),
  db.collection("products").createIndex({slug:1},{unique:true}),
  db.collection("reviews").createIndex({productId:1,status:1,createdAt:-1}),
  db.collection("orders").createIndex({userId:1,createdAt:-1}),
  db.collection("email_otps").createIndex({expiresAt:1},{expireAfterSeconds:0}),
  db.collection("pending_registrations").createIndex({expiresAt:1},{expireAfterSeconds:0}),
  db.collection("coupons").createIndex({code:1},{unique:true})
 ]);
 await seed();return db;
}
async function seed(){
 const now=new Date();
 const oldSlugs=["woodberry-pro","woodberry-elite","woodberry-ghost","woodberry-icon","woodberry-ton"];
 await db.collection("products").deleteMany({slug:{$in:oldSlugs}});
 const product={
   slug:"woodberry-signature",
   name:"Woodberry Signature English Willow",
   category:"Cricket Bat",
   willow:"Premium English Willow",
   price:10000,
   mrp:12500,
   stock:12,
   featured:true,
   active:true,
   badge:"Signature",
   description:"Woodberry Signature English Willow cricket bat with a full blade profile, balanced pickup and match-ready finish.",
   features:["Premium English willow","Balanced pickup","Full profile","Toe guard included","Custom weight request available"],
   images:[
     "https://i.etsystatic.com/iap/ea26e4/7076494143/iap_640x640.7076494143_l4bgbsy8.jpg?version=0",
     "https://i.etsystatic.com/25498349/r/il/396c27/6064485291/il_794xN.6064485291_nmb6.jpg"
   ],
   updatedAt:now
 };
 await db.collection("products").updateOne({slug:product.slug},{$setOnInsert:{...product,createdAt:now}},{upsert:true});
 await db.collection("settings").updateOne({_id:"site"},{$set:{
   brandName:"Woodberry Sports",
   tagline:"Premium Willow Cricket Bats",
   announcement:"₹10,000 each • Free worldwide delivery • COD available",
   whatsapp:WHATSAPP,
   contactEmail:EMAIL||"notout@woodberrycricket.com",
   instagram:"https://www.instagram.com/woodberrysports",
   facebook:"https://www.facebook.com/woodberrymeerut",
   developerName:"Swastik Shukla",
   updatedAt:now
 }},{upsert:true});
}
async function importSeedImages(){
 const fallback=["/assets/bat-placeholder.svg"];
 try{
  const src=process.env.SEED_IMAGE_SOURCE||"https://woodberry-sports.vercel.app/";
  const r=await fetch(src,{headers:{"User-Agent":"WoodberrySportsSeeder/1.0"}});if(!r.ok)return fallback;
  const html=await r.text(),matches=[...html.matchAll(/data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/=]+/g)].map(x=>x[0]);
  const uniq=[...new Set(matches)].slice(0,14),urls=[];
  for(let i=0;i<uniq.length;i++){const m=uniq[i].match(/^data:image\/(webp|jpeg|png);base64,(.+)$/s);if(!m)continue;const buf=Buffer.from(m[2],"base64"),s=bucket.openUploadStream("seed-"+i,{metadata:{contentType:"image/"+m[1]}});s.end(buf);await new Promise((ok,no)=>{s.on("finish",ok);s.on("error",no)});urls.push("/api/media/"+s.id)}
  return urls.length?urls:fallback;
 }catch{return fallback}
}
app.disable("x-powered-by");
app.use((req,res,next)=>{res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("X-Frame-Options","DENY");res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");if(process.env.NODE_ENV==="production")res.setHeader("Strict-Transport-Security","max-age=31536000; includeSubDomains");next()});
app.use(express.json({limit:"2mb"}));app.use(express.urlencoded({extended:true}));app.use(cookieParser());
app.use((req,res,next)=>{if(req.path==="/admin.html")return res.status(404).send("Not found");next()});
app.use(express.static(path.join(__dirname,"public"),{etag:true,maxAge:"7d",index:false}));
const clean=(v,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g,"").trim().slice(0,n);
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||"").toLowerCase());
const sign=(p,h=168)=>jwt.sign(p,SECRET,{expiresIn:h+"h"});
function session(req){try{return jwt.verify(req.cookies.wb_session||"",SECRET)}catch{return null}}
function setSession(res,t){res.cookie("wb_session",t,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:7*864e5})}
function auth(req,res,next){const s=session(req);if(!s?.userId)return res.status(401).json({error:"Please sign in."});req.session=s;next()}
function admin(req,res,next){if(session(req)?.role!=="admin")return res.status(401).json({error:"Admin sign-in required."});next()}
const safeUser=u=>({id:String(u._id),name:u.name,email:u.email,phone:u.phone||"",addresses:u.addresses||[],role:u.role||"customer",profilePhoto:u.profilePhoto||"",emailVerified:u.emailVerified!==false});
const safeProduct=p=>({...p,_id:String(p._id)});
const profileUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1},fileFilter:(req,f,cb)=>cb(null,["image/jpeg","image/png","image/webp"].includes(f.mimetype))});
const otpKey=(email,purpose)=>purpose+":"+email.toLowerCase();
const otpHash=(email,purpose,code)=>crypto.createHmac("sha256",SECRET).update(otpKey(email,purpose)+"|"+code).digest("hex");
async function sendOtpEmail(email,purpose,displayName=""){
 if(!RESEND_API)throw Error("Email OTP is not configured.");
 const code=String(crypto.randomInt(100000,1000000));
 const key=otpKey(email,purpose), now=new Date(), old=await db.collection("email_otps").findOne({_id:key});
 if(old?.sentAt&&Date.now()-new Date(old.sentAt).getTime()<60000)throw Error("Please wait one minute before requesting another code.");
 await db.collection("email_otps").updateOne({_id:key},{$set:{email,purpose,otpHash:otpHash(email,purpose,code),attempts:0,sentAt:now,expiresAt:new Date(Date.now()+10*60*1000),updatedAt:now}},{upsert:true});
 const subject=purpose==="register"?"Verify your Woodberry Sports account":purpose==="admin_delete"?"Approve a Woodberry admin account action":"Reset your Woodberry Sports password";
 const intro=purpose==="register"?"Use this code to verify your email and create your Woodberry Sports account.":purpose==="admin_delete"?"Use this code only if you personally authorized the requested administrator action.":"Use this code to reset your Woodberry Sports password.";
 const html='<div style="font-family:Arial,sans-serif;background:#07110d;color:#f7f1de;padding:32px"><div style="max-width:560px;margin:auto;background:#0d1714;border:1px solid #5c4927;border-radius:18px;padding:28px"><p style="color:#d8ad52;font-weight:700;letter-spacing:.08em">WOODBERRY SPORTS</p><h2 style="margin:8px 0 12px">'+subject+'</h2><p>Hello '+clean(displayName||"there",80)+',</p><p>'+intro+'</p><div style="font-size:34px;font-weight:800;letter-spacing:10px;margin:24px 0;color:#f1d58a">'+code+'</div><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></div></div>';
 const rr=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+RESEND_API,"Content-Type":"application/json"},body:JSON.stringify({from:RESEND_FROM,to:[email],subject,html,tags:[{name:"category",value:purpose==="register"?"verify_email":"password_reset"}]})});
 if(!rr.ok){const txt=await rr.text();console.error("Resend:",rr.status,txt);throw Error("Could not send verification email. Check the email sender configuration.");}
 return true;
}
async function verifyOtp(email,purpose,code){
 const key=otpKey(email,purpose), rec=await db.collection("email_otps").findOne({_id:key});
 if(!rec||new Date(rec.expiresAt).getTime()<Date.now())throw Error("The verification code has expired.");
 if((rec.attempts||0)>=5)throw Error("Too many incorrect attempts. Request a new code.");
 if(otpHash(email,purpose,String(code||""))!==rec.otpHash){await db.collection("email_otps").updateOne({_id:key},{$inc:{attempts:1}});throw Error("Incorrect verification code.");}
 await db.collection("email_otps").deleteOne({_id:key});return true;
}

async function sendEmail(to,subject,html){
 const recipients=[...new Set((Array.isArray(to)?to:[to]).filter(Boolean))];
 if(!RESEND_API||!recipients.length)return {sent:false,reason:"email_not_configured"};
 try{
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+RESEND_API,"Content-Type":"application/json"},body:JSON.stringify({from:RESEND_FROM,to:recipients,subject,html})});
  if(!response.ok){console.error("Woodberry email delivery failed:",response.status);return {sent:false,reason:"delivery_failed"}}
  return {sent:true};
 }catch(err){console.error("Woodberry email:",err.message);return {sent:false,reason:"network_error"}}
}
const commerce=require("./commerce")(app,{connect,dbRef:()=>db,auth,admin,session,clean,sendEmail,sendOtpEmail,verifyOtp,adminEmail:ADMIN_EMAIL});
app.get("/api/health",async(req,res)=>{try{await connect();await db.command({ping:1});res.json({ok:true,database:"connected",mongodbConfigured:!!URI,resendConfigured:!!RESEND_API})}catch(e){res.status(503).json({ok:false,database:"unavailable",mongodbConfigured:!!URI,resendConfigured:!!RESEND_API,error:URI?"Database connection failed.":"MONGODB_URI is not configured on this deployment."})}});
app.get("/api/config",async(req,res)=>{await connect();res.json({settings:await db.collection("settings").findOne({_id:"site"}),razorpayEnabled:!!(RZ_ID&&RZ_SECRET),razorpayKeyId:RZ_ID||null,emailOtpEnabled:!!RESEND_API})});
app.get("/api/products",async(req,res)=>{await connect();const rows=await db.collection("products").find({active:{$ne:false}}).sort({featured:-1,createdAt:-1}).toArray();res.json({products:rows.map(safeProduct)})});
app.get("/api/reviews",async(req,res)=>{await connect();const q={status:"approved"};if(req.query.productId&&ObjectId.isValid(req.query.productId))q.productId=new ObjectId(req.query.productId);const rows=await db.collection("reviews").find(q).sort({createdAt:-1}).limit(100).toArray();res.json({reviews:rows.map(x=>({...x,_id:String(x._id),productId:String(x.productId),userId:String(x.userId)}))})});

app.post("/api/auth/register",async(req,res)=>{try{
 await connect();const name=clean(req.body.name,80),email=clean(req.body.email,120).toLowerCase(),phone=clean(req.body.phone,24),password=String(req.body.password||"");
 if(name.length<2||!emailOk(email)||password.length<8)return res.status(400).json({error:"Use a valid name, email and 8+ character password."});
 if(await db.collection("users").findOne({email}))return res.status(409).json({error:"Account already exists."});
 const passwordHash=await bcrypt.hash(password,12);
 await db.collection("pending_registrations").updateOne({_id:email},{$set:{name,email,phone,passwordHash,referralCode:clean(req.body.referralCode,60).toUpperCase(),createdAt:new Date(),expiresAt:new Date(Date.now()+30*60*1000)}},{upsert:true});
 await sendOtpEmail(email,"register",name);
 res.status(202).json({requiresOtp:true,email,message:"Verification code sent to your email."});
 }catch(e){const infra=/MONGODB_URI|Email OTP is not configured|Could not send verification email|Mongo/i.test(e.message);res.status(infra?503:400).json({error:e.message})}});
app.post("/api/auth/verify-otp",async(req,res)=>{try{
 await connect();const email=clean(req.body.email,120).toLowerCase();await verifyOtp(email,"register",req.body.code);
 const pending=await db.collection("pending_registrations").findOne({_id:email});if(!pending||new Date(pending.expiresAt).getTime()<Date.now())throw Error("Registration session expired. Start again.");
 if(await db.collection("users").findOne({email}))return res.status(409).json({error:"Account already exists."});
 const doc={name:pending.name,email,phone:pending.phone,passwordHash:pending.passwordHash,addresses:[],profilePhoto:"",emailVerified:true,role:"customer",createdAt:new Date(),updatedAt:new Date()};
 const out=await db.collection("users").insertOne(doc);
 if(pending.referralCode){const referrer=await db.collection("users").findOne({referralCode:pending.referralCode,_id:{$ne:out.insertedId}});if(referrer)await commerce.issueReferral(referrer._id,out.insertedId)}
 await db.collection("pending_registrations").deleteOne({_id:email});
 setSession(res,sign({userId:String(out.insertedId),role:"customer",email}));res.status(201).json({user:safeUser({...doc,_id:out.insertedId})});
 }catch(e){res.status(400).json({error:e.message})}});
app.post("/api/auth/resend-otp",async(req,res)=>{try{
 await connect();const email=clean(req.body.email,120).toLowerCase(),purpose=req.body.purpose==="reset"?"reset":"register";
 const name=purpose==="register"?(await db.collection("pending_registrations").findOne({_id:email}))?.name:"";
 await sendOtpEmail(email,purpose,name||"");res.json({ok:true,message:"A new code was sent."});
 }catch(e){const infra=/MONGODB_URI|Email OTP is not configured|Could not send verification email|Mongo/i.test(e.message);res.status(infra?503:400).json({error:e.message})}});
app.post("/api/auth/forgot-password",async(req,res)=>{try{
 await connect();const email=clean(req.body.email,120).toLowerCase(),u=await db.collection("users").findOne({email});
 if(u)await sendOtpEmail(email,"reset",u.name);res.json({ok:true,message:"If that account exists, a reset code has been sent."});
 }catch(e){const infra=/MONGODB_URI|Email OTP is not configured|Could not send verification email|Mongo/i.test(e.message);res.status(infra?503:400).json({error:e.message})}});
app.post("/api/auth/reset-password",async(req,res)=>{try{
 await connect();const email=clean(req.body.email,120).toLowerCase(),password=String(req.body.password||"");if(password.length<8)return res.status(400).json({error:"Password must be at least 8 characters."});
 await verifyOtp(email,"reset",req.body.code);const passwordHash=await bcrypt.hash(password,12);await db.collection("users").updateOne({email},{$set:{passwordHash,updatedAt:new Date()}});
 res.json({ok:true,message:"Password updated. You can sign in now."});
 }catch(e){res.status(400).json({error:e.message})}});
app.post("/api/auth/login",async(req,res)=>{await connect();const email=clean(req.body.email,120).toLowerCase(),u=await db.collection("users").findOne({email});if(!u||!await bcrypt.compare(String(req.body.password||""),u.passwordHash))return res.status(401).json({error:"Incorrect email or password."});if(u.emailVerified===false)return res.status(403).json({error:"Please verify your email first."});setSession(res,sign({userId:String(u._id),role:u.role||"customer",email:u.email}));res.json({user:safeUser(u)})});
app.post("/api/auth/logout",(req,res)=>{res.clearCookie("wb_session",{path:"/"});res.json({ok:true})});
app.get("/api/me",async(req,res)=>{const s=session(req);if(!s?.userId)return res.json({user:null});await connect();const u=await db.collection("users").findOne({_id:new ObjectId(s.userId)});res.json({user:u?safeUser(u):null})});
app.put("/api/me",auth,async(req,res)=>{await connect();const id=new ObjectId(req.session.userId);await db.collection("users").updateOne({_id:id},{$set:{name:clean(req.body.name,80),phone:clean(req.body.phone,24),updatedAt:new Date()}});res.json({user:safeUser(await db.collection("users").findOne({_id:id}))})});
app.post("/api/me/photo",auth,profileUpload.single("photo"),async(req,res)=>{try{
 await connect();if(!req.file)return res.status(400).json({error:"Choose a JPG, PNG or WebP image."});const id=new ObjectId(req.session.userId),u=await db.collection("users").findOne({_id:id});
 if(u?.profilePhoto?.startsWith("/api/media/")){try{await bucket.delete(new ObjectId(u.profilePhoto.split("/").pop()))}catch{}}
 const s=bucket.openUploadStream("profile-"+Date.now(),{metadata:{contentType:req.file.mimetype,kind:"profile",userId:String(id)}});s.end(req.file.buffer);await new Promise((ok,no)=>{s.on("finish",ok);s.on("error",no)});
 const profilePhoto="/api/media/"+s.id;await db.collection("users").updateOne({_id:id},{$set:{profilePhoto,updatedAt:new Date()}});
 res.json({user:safeUser(await db.collection("users").findOne({_id:id}))});
 }catch(e){res.status(400).json({error:e.message})}});
app.delete("/api/me/photo",auth,async(req,res)=>{await connect();const id=new ObjectId(req.session.userId),u=await db.collection("users").findOne({_id:id});if(u?.profilePhoto?.startsWith("/api/media/")){try{await bucket.delete(new ObjectId(u.profilePhoto.split("/").pop()))}catch{}}await db.collection("users").updateOne({_id:id},{$set:{profilePhoto:"",updatedAt:new Date()}});res.json({user:safeUser(await db.collection("users").findOne({_id:id}))})});
app.delete("/api/me",auth,async(req,res)=>{await connect();const id=new ObjectId(req.session.userId),u=await db.collection("users").findOne({_id:id});if(u?.profilePhoto?.startsWith("/api/media/")){try{await bucket.delete(new ObjectId(u.profilePhoto.split("/").pop()))}catch{}}await Promise.all([
 db.collection("users").deleteOne({_id:id}),
 db.collection("notifications").deleteMany({userId:id}),
 db.collection("reviews").deleteMany({userId:id}),
 db.collection("orders").updateMany({userId:id},{$set:{userId:null,customerDeleted:true},$unset:{"address.phone":""}})
]);res.clearCookie("wb_session",{path:"/"});res.json({ok:true})});
app.post("/api/me/addresses",auth,async(req,res)=>{await connect();const a={id:crypto.randomUUID(),label:clean(req.body.label,30)||"Home",name:clean(req.body.name,80),phone:clean(req.body.phone,24),line1:clean(req.body.line1,160),line2:clean(req.body.line2,160),landmark:clean(req.body.landmark,120),pincode:clean(req.body.pincode,6),city:clean(req.body.city,80),state:clean(req.body.state,80),country:"India"};if(!/^\d{6}$/.test(a.pincode)||!a.name||!a.line1||!a.city||!a.state)return res.status(400).json({error:"Complete the address and use a valid PIN."});const id=new ObjectId(req.session.userId);await db.collection("users").updateOne({_id:id},{$push:{addresses:a}});res.status(201).json({addresses:(await db.collection("users").findOne({_id:id})).addresses})});
app.put("/api/me/addresses/:id",auth,async(req,res)=>{await connect();const id=new ObjectId(req.session.userId),a={id:req.params.id,label:clean(req.body.label,30)||"Home",name:clean(req.body.name,80),phone:clean(req.body.phone,24),line1:clean(req.body.line1,160),line2:clean(req.body.line2,160),landmark:clean(req.body.landmark,120),pincode:clean(req.body.pincode,6),city:clean(req.body.city,80),state:clean(req.body.state,80),country:"India"};if(!/^\d{6}$/.test(a.pincode)||!a.name||!a.line1||!a.city||!a.state)return res.status(400).json({error:"Complete the address and use a valid PIN."});await db.collection("users").updateOne({_id:id,"addresses.id":req.params.id},{$set:{"addresses.$":a}});res.json({addresses:(await db.collection("users").findOne({_id:id})).addresses||[]})});
app.delete("/api/me/addresses/:id",auth,async(req,res)=>{await connect();const id=new ObjectId(req.session.userId);await db.collection("users").updateOne({_id:id},{$pull:{addresses:{id:req.params.id}}});res.json({addresses:(await db.collection("users").findOne({_id:id})).addresses||[]})});

app.post("/api/reviews",auth,async(req,res)=>{await connect();if(!ObjectId.isValid(req.body.productId))return res.status(400).json({error:"Invalid product."});const u=await db.collection("users").findOne({_id:new ObjectId(req.session.userId)}),rating=Math.max(1,Math.min(5,Number(req.body.rating)||0)),comment=clean(req.body.comment,1200);if(!rating||!comment)return res.status(400).json({error:"Rating and review are required."});await db.collection("reviews").insertOne({productId:new ObjectId(req.body.productId),userId:u._id,userName:u.name,rating,comment,status:"pending",createdAt:new Date()});res.status(201).json({message:"Review submitted for moderation."})});
app.get("/api/notifications",auth,async(req,res)=>{await connect();const rows=await db.collection("notifications").find({userId:new ObjectId(req.session.userId)}).sort({createdAt:-1}).limit(50).toArray();res.json({notifications:rows.map(x=>({...x,_id:String(x._id)}))})});
app.post("/api/notifications/read",auth,async(req,res)=>{await connect();await db.collection("notifications").updateMany({userId:new ObjectId(req.session.userId)},{$set:{read:true}});res.json({ok:true})});

app.get("/api/pincode/:pin",async(req,res)=>{const pin=String(req.params.pin||"");if(!/^\d{6}$/.test(pin))return res.status(400).json({error:"PIN must be 6 digits."});try{const r=await fetch("https://api.postalpincode.in/pincode/"+pin,{headers:{"User-Agent":"WoodberrySports/1.0"}}),d=await r.json(),row=d?.[0];if(row?.Status!=="Success")return res.status(404).json({error:"PIN not found."});res.json({pincode:pin,offices:(row.PostOffice||[]).map(o=>({name:o.Name,district:o.District,state:o.State,country:o.Country||"India"}))})}catch{res.status(502).json({error:"PIN service unavailable."})}});

async function priced(items){
 items=Array.isArray(items)?items:[];
 if(!items.length||items.length>20)throw Error("Select one or more products.");
 const ids=items.map(x=>{if(!ObjectId.isValid(x.productId))throw Error("Unknown product.");return new ObjectId(x.productId)});
 const ps=await db.collection("products").find({_id:{$in:ids},active:{$ne:false}}).toArray(),lookup=new Map(ps.map(p=>[String(p._id),p]));
 let total=0;const lines=[];
 for(const x of items){
  const p=lookup.get(String(x.productId)),qty=Number(x.qty);
  if(!p||!Number.isInteger(qty)||qty<1||qty>10)throw Error("Invalid product quantity.");
  if(!Number.isInteger(p.stock)||p.stock<qty)throw Error(p.name+" is out of stock.");
  if(!Number.isFinite(Number(p.price))||Number(p.price)<0)throw Error("Invalid product price.");
  lines.push({productId:p._id,name:p.name,price:p.price,qty,image:p.images?.[0]||""});total+=p.price*qty;
 }
 return {lines,total}
}
async function address(uid,id,raw){if(id){const u=await db.collection("users").findOne({_id:new ObjectId(uid)}),a=(u.addresses||[]).find(x=>x.id===id);if(a)return a}const a={name:clean(raw?.name,80),phone:clean(raw?.phone,24),line1:clean(raw?.line1,160),line2:clean(raw?.line2,160),pincode:clean(raw?.pincode,6),city:clean(raw?.city,80),state:clean(raw?.state,80),country:"India"};if(!a.name||!a.line1||!/^\d{6}$/.test(a.pincode)||!a.city||!a.state)throw Error("Complete delivery address required.");return a}
app.post("/api/checkout/cod",auth,async(req,res)=>{try{await connect();const p=await priced(req.body.items),a=await address(req.session.userId,req.body.addressId,req.body.address);if(!p.lines.length)return res.status(400).json({error:"Cart is empty."});let discount=0,appliedCoupon=null;
 const couponCode=clean(req.body.couponCode,64).toUpperCase();
 if(couponCode){
  const coupon=await db.collection("coupons").findOne({code:couponCode,active:true});
  if(!coupon||coupon.ownerId&&String(coupon.ownerId)!==String(req.session.userId)||coupon.expiresAt&&new Date(coupon.expiresAt)<new Date()||coupon.limit&&coupon.used>=coupon.limit||p.total<(coupon.minSpend||0))return res.status(400).json({error:"Coupon unavailable"});
  discount=Math.min(p.total,coupon.amount);appliedCoupon=couponCode;
 }
 const doc={discount,couponCode:appliedCoupon,userId:new ObjectId(req.session.userId),items:p.lines,total:p.total-discount,paymentMethod:"cod",paymentStatus:"pending",orderStatus:"placed",address:a,history:[{status:"placed",at:new Date(),by:"customer"}],createdAt:new Date(),updatedAt:new Date()},o=await db.collection("orders").insertOne(doc);
  const reserved=[];
  try{
   for(const item of p.lines){
    const result=await db.collection("products").updateOne({_id:item.productId,stock:{$gte:item.qty}},{$inc:{stock:-item.qty},$push:{stockHistory:{from:null,to:null,delta:-item.qty,note:"Reserved for order "+String(o.insertedId),at:new Date()}}});
    if(!result.modifiedCount)throw Error("Not enough inventory for "+item.name);
    reserved.push(item)
   }
  }catch(err){
   for(const item of reserved)await db.collection("products").updateOne({_id:item.productId},{$inc:{stock:item.qty}});
   await db.collection("orders").deleteOne({_id:o.insertedId});throw err;
  }if(appliedCoupon)await db.collection("coupons").updateOne({code:appliedCoupon,used:{$lt:100000}},{$inc:{used:1}});
 await db.collection("notifications").insertOne({userId:doc.userId,title:"Order placed",message:"Your COD order #"+String(o.insertedId).slice(-8).toUpperCase()+" has been placed.",read:false,createdAt:new Date()});const u=await db.collection("users").findOne({_id:doc.userId});
 await sendEmail([process.env.ORDER_ALERT_EMAIL||"jiking847@gmail.com",ADMIN_EMAIL].filter(Boolean),"New Woodberry order #"+String(o.insertedId).slice(-8),"<h2>New COD order</h2><p>Order "+String(o.insertedId)+"</p><p>Total INR "+p.total+"</p><p>Customer "+(u?.email||"")+" - "+a.name+"</p>");
 res.status(201).json({orderId:String(o.insertedId),total:doc.total})}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/checkout/razorpay/create",auth,async(req,res)=>{try{if(!RZ_ID||!RZ_SECRET)return res.status(503).json({error:"Online payments are not enabled."});await connect();const p=await priced(req.body.items),a=await address(req.session.userId,req.body.addressId,req.body.address);if(!p.lines.length)return res.status(400).json({error:"Cart is empty."});const rz=new Razorpay({key_id:RZ_ID,key_secret:RZ_SECRET}),ro=await rz.orders.create({amount:p.total*100,currency:"INR",receipt:"wb_"+Date.now()}),doc={userId:new ObjectId(req.session.userId),items:p.lines,total:p.total,paymentMethod:"razorpay",paymentStatus:"created",orderStatus:"awaiting_payment",address:a,razorpayOrderId:ro.id,createdAt:new Date(),updatedAt:new Date()},o=await db.collection("orders").insertOne(doc);res.json({localOrderId:String(o.insertedId),razorpayOrderId:ro.id,amount:ro.amount,currency:ro.currency,keyId:RZ_ID})}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/checkout/razorpay/verify",auth,async(req,res)=>{await connect();const x=req.body,expected=crypto.createHmac("sha256",RZ_SECRET).update(x.razorpay_order_id+"|"+x.razorpay_payment_id).digest("hex");if(expected!==x.razorpay_signature)return res.status(400).json({error:"Payment verification failed."});const id=new ObjectId(x.localOrderId),o=await db.collection("orders").findOne({_id:id,userId:new ObjectId(req.session.userId)});if(!o)return res.status(404).json({error:"Order not found."});await db.collection("orders").updateOne({_id:id},{$set:{paymentStatus:"paid",orderStatus:"placed",razorpayPaymentId:x.razorpay_payment_id,updatedAt:new Date()}});const buyer=await db.collection("users").findOne({_id:o.userId});
 await sendEmail([process.env.ORDER_ALERT_EMAIL||"jiking847@gmail.com",ADMIN_EMAIL].filter(Boolean),"Paid Woodberry order #"+String(id).slice(-8),"<h2>New paid order</h2><p>Order "+String(id)+"</p><p>Customer "+(buyer?.email||"")+"</p><p>Total INR "+o.total+"</p>");
 res.json({ok:true,orderId:String(id)})});
app.get("/api/orders",auth,async(req,res)=>{await connect();const rows=await db.collection("orders").find({userId:new ObjectId(req.session.userId)}).sort({createdAt:-1}).toArray();res.json({orders:rows.map(x=>({...x,_id:String(x._id)}))})});

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:12},fileFilter:(req,f,cb)=>cb(null,["image/jpeg","image/png","image/webp"].includes(f.mimetype))});
app.get("/api/media/:id",async(req,res)=>{try{await connect();const id=new ObjectId(req.params.id),f=(await bucket.find({_id:id}).toArray())[0];if(!f)return res.status(404).end();if(f.metadata?.kind==="profile"&&session(req)?.role!=="admin"&&String(session(req)?.userId||"")!==String(f.metadata?.userId||""))return res.status(403).end();res.setHeader("Content-Type",f.metadata?.contentType||"application/octet-stream");res.setHeader("Cache-Control","public,max-age=31536000,immutable");bucket.openDownloadStream(id).pipe(res)}catch{res.status(404).end()}});
app.post("/api/admin/login",async(req,res)=>{
 if(!ADMIN_PASSWORD||SECRET==="change-me")return res.status(503).json({error:"Administrator security is not configured. Set ADMIN_PASSWORD and SESSION_SECRET in your deployment environment."});
 const email=clean(req.body.email,120).toLowerCase(),password=String(req.body.password||"");
 if(email!==ADMIN_EMAIL)return res.status(401).json({error:"Invalid admin credentials."});
 const a=Buffer.from(password),b=Buffer.from(ADMIN_PASSWORD);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).json({error:"Invalid admin credentials."});
 setSession(res,sign({role:"admin",email:ADMIN_EMAIL},8));res.json({ok:true});
});
app.get("/api/admin/session",(req,res)=>res.json({authenticated:session(req)?.role==="admin"}));
app.post("/api/admin/logout",(req,res)=>{res.clearCookie("wb_session",{path:"/"});res.json({ok:true})});
app.get("/api/admin/dashboard",admin,async(req,res)=>{await connect();const [products,users,orders,reviews]=await Promise.all([db.collection("products").countDocuments(),db.collection("users").countDocuments(),db.collection("orders").countDocuments(),db.collection("reviews").countDocuments({status:"pending"})]);res.json({products,users,orders,pendingReviews:reviews})});
app.get("/api/admin/products",admin,async(req,res)=>{await connect();res.json({products:(await db.collection("products").find({}).sort({createdAt:-1}).toArray()).map(safeProduct)})});
app.post("/api/admin/products",admin,async(req,res)=>{await connect();const p={slug:clean(req.body.slug,120)||clean(req.body.name,120).toLowerCase().replace(/[^a-z0-9]+/g,"-"),name:clean(req.body.name,120),category:clean(req.body.category,80)||"Cricket Bat",willow:clean(req.body.willow,120),price:Math.max(0,Number(req.body.price)||0),mrp:Math.max(0,Number(req.body.mrp)||0),stock:Math.max(0,Number(req.body.stock)||0),featured:!!req.body.featured,active:req.body.active!==false,badge:clean(req.body.badge,40),description:clean(req.body.description,1600),features:Array.isArray(req.body.features)?req.body.features.map(x=>clean(x,140)).filter(Boolean):[],images:Array.isArray(req.body.images)?req.body.images.map(x=>clean(x,900)).filter(Boolean):[],createdAt:new Date(),updatedAt:new Date()};if(!p.name||!p.price)return res.status(400).json({error:"Name and price required."});const o=await db.collection("products").insertOne(p);res.status(201).json({product:safeProduct({...p,_id:o.insertedId})})});
app.put("/api/admin/products/:id",admin,async(req,res)=>{await connect();const id=new ObjectId(req.params.id),allowed=["name","slug","category","willow","price","mrp","stock","featured","active","badge","description","features","images"],u={updatedAt:new Date()};for(const k of allowed)if(Object.prototype.hasOwnProperty.call(req.body,k))u[k]=req.body[k];await db.collection("products").updateOne({_id:id},{$set:u});res.json({product:safeProduct(await db.collection("products").findOne({_id:id}))})});
app.delete("/api/admin/products/:id",admin,async(req,res)=>{await connect();await db.collection("products").deleteOne({_id:new ObjectId(req.params.id)});res.json({ok:true})});
app.post("/api/admin/media",admin,upload.array("images",12),async(req,res)=>{await connect();const files=[];for(const f of req.files||[]){const s=bucket.openUploadStream(Date.now()+"-"+f.originalname,{metadata:{contentType:f.mimetype,originalName:f.originalname}});s.end(f.buffer);await new Promise((ok,no)=>{s.on("finish",ok);s.on("error",no)});files.push({url:"/api/media/"+s.id,name:f.originalname,size:f.size})}res.json({files})});
app.get("/api/admin/reviews",admin,async(req,res)=>{await connect();const rows=await db.collection("reviews").find({}).sort({createdAt:-1}).toArray();res.json({reviews:rows.map(x=>({...x,_id:String(x._id)}))})});
app.put("/api/admin/reviews/:id",admin,async(req,res)=>{await connect();const status=["approved","rejected","pending"].includes(req.body.status)?req.body.status:"pending";await db.collection("reviews").updateOne({_id:new ObjectId(req.params.id)},{$set:{status,updatedAt:new Date()}});res.json({ok:true})});
app.delete("/api/admin/reviews/:id",admin,async(req,res)=>{await connect();await db.collection("reviews").deleteOne({_id:new ObjectId(req.params.id)});res.json({ok:true})});
app.get("/api/admin/orders",admin,async(req,res)=>{await connect();res.json({orders:await db.collection("orders").find({}).sort({createdAt:-1}).limit(200).toArray()})});
app.put("/api/admin/orders/:id",admin,async(req,res)=>{await connect();const id=new ObjectId(req.params.id),u={updatedAt:new Date()};if(req.body.orderStatus)u.orderStatus=clean(req.body.orderStatus,40);if(req.body.paymentStatus)u.paymentStatus=clean(req.body.paymentStatus,40);await db.collection("orders").updateOne({_id:id},{$set:u});const o=await db.collection("orders").findOne({_id:id});await db.collection("notifications").insertOne({userId:o.userId,title:"Order updated",message:"Order #"+String(id).slice(-8).toUpperCase()+" is now "+o.orderStatus+".",read:false,createdAt:new Date()});res.json({ok:true})});
app.get("/api/admin/users",admin,async(req,res)=>{await connect();res.json({users:await db.collection("users").find({},{projection:{passwordHash:0}}).sort({createdAt:-1}).limit(200).toArray()})});

app.get(ADMIN_ROUTE,(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("/admin",(req,res)=>res.status(404).send("Not found"));
app.get("/privacy",(req,res)=>res.sendFile(path.join(__dirname,"public","privacy.html")));
app.get("/terms",(req,res)=>res.sendFile(path.join(__dirname,"public","terms.html")));
app.get("/shipping",(req,res)=>res.sendFile(path.join(__dirname,"public","shipping.html")));
app.get("/returns",(req,res)=>res.sendFile(path.join(__dirname,"public","returns.html")));
app.get("/cookies",(req,res)=>res.sendFile(path.join(__dirname,"public","cookies.html")));
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.use("/api",(req,res)=>res.status(404).json({error:"API endpoint not found."}));
app.get("*",(req,res)=>res.status(404).sendFile(path.join(__dirname,"public","404.html")));
connect().catch(e=>console.error("MongoDB:",e.message));
app.listen(PORT,"0.0.0.0",()=>console.log("Woodberry Sports on "+PORT));
