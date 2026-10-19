"use strict";
const crypto=require("crypto");
const {ObjectId}=require("mongodb");
module.exports=function installCommerce(app,{connect,dbRef,auth,admin,session,clean,sendEmail,sendOtpEmail,verifyOtp,adminEmail}) {
 const db=()=>dbRef();
 const id=x=>ObjectId.isValid(x)?new ObjectId(x):null;
 const safe=(f)=>(req,res,next)=>Promise.resolve(f(req,res,next)).catch(e=>{console.error("commerce",e.message);if(!res.headersSent)res.status(400).json({error:e.message||"Unable to complete request"})});
 const uid=req=>id(req.session.userId);
 const orderStatus=["placed","confirmed","rejected","processing","packed","shipped","out_for_delivery","delivered","return_requested","return_approved","return_rejected","returned","refund_pending","refunded","cancelled"];
 const shippingStatus=["confirmed","processing","packed","shipped","out_for_delivery","delivered"];
 const nonce=()=>crypto.randomBytes(5).toString("hex").toUpperCase();
 async function notify(userId,title,message) {
  if(!userId)return;
  await db().collection("notifications").insertOne({userId,title,message,read:false,createdAt:new Date()});
 }
 function couponDTO(c){return{code:c.code,amount:c.amount,expiresAt:c.expiresAt||null,minSpend:c.minSpend||0,used:c.used||0,limit:c.limit||0,active:c.active!==false}}
 async function grant(userId,kind,amount,metadata={}) {
  const code="WB"+kind.toUpperCase().replace(/[^A-Z]/g,"").slice(0,4)+"-"+nonce();
  const c={code,amount,kind,ownerId:userId,used:0,limit:1,active:true,minSpend:1000,createdAt:new Date(),...metadata};
  await db().collection("coupons").insertOne(c);
  await notify(userId,"Coupon unlocked","Your "+amount+" rupee coupon is "+code);
  return c;
 }
 async function completeProfile(u) {
  if(u?.profileRewarded||!u?.profilePhoto||!u?.phone||!(u.addresses||[]).length||!u.emailVerified)return null;
  const updated=await db().collection("users").updateOne({_id:u._id,profileRewarded:{$ne:true}},{$set:{profileRewarded:true}});
  if(updated.modifiedCount)return grant(u._id,"complete",100);
  return null;
 }
 async function issueReferral(referrer,referee) {
  if(!referrer||!referee||String(referrer)===String(referee))return;
  await grant(referrer,"refer",150);
  await grant(referee,"welcome",100);
 }
 app.get("/api/me/benefits",auth,safe(async(req,res)=>{
  await connect();const u=await db().collection("users").findOne({_id:uid(req)});
  await completeProfile(u);
  const coupons=await db().collection("coupons").find({ownerId:uid(req),active:{$ne:false},used:{$lt:1}}).sort({createdAt:-1}).limit(40).toArray();
  const code=u.referralCode||("WB"+String(u._id).slice(-7).toUpperCase());
  if(!u.referralCode)await db().collection("users").updateOne({_id:u._id},{$set:{referralCode:code}});
  res.json({referralCode:code,profileComplete:!!u.profileRewarded,profileChecklist:{name:!!u.name,phone:!!u.phone,address:!!u.addresses?.length,photo:!!u.profilePhoto,email:!!u.emailVerified},coupons:coupons.map(couponDTO)});
 }));
 app.post("/api/me/complete",auth,safe(async(req,res)=>{
  await connect();const u=await db().collection("users").findOne({_id:uid(req)});
  const coupon=await completeProfile(u);res.json({ok:true,awarded:!!coupon});
 }));
 app.post("/api/coupons/validate",auth,safe(async(req,res)=>{
  await connect();const code=clean(req.body.code,64).toUpperCase();
  const c=await db().collection("coupons").findOne({code,active:true});
  const subtotal=Math.max(0,Number(req.body.subtotal)||0);
  if(!c||c.ownerId&&String(c.ownerId)!==String(uid(req))||c.expiresAt&&new Date(c.expiresAt)<new Date()||c.limit&&c.used>=c.limit||subtotal<(c.minSpend||0))return res.status(400).json({error:"Coupon unavailable or not applicable."});
  res.json({valid:true,code,amount:Math.min(c.amount,subtotal)});
 }));
 app.post("/api/issues",auth,safe(async(req,res)=>{
  await connect();
  const type=clean(req.body.type,32),message=clean(req.body.message,3000);
  if(!["bug","order","product","other"].includes(type)||message.length<12)return res.status(400).json({error:"Select a category and enter at least 12 characters."});
  const u=await db().collection("users").findOne({_id:uid(req)});
  const doc={userId:u._id,email:u.email,type,message,status:"open",createdAt:new Date(),updatedAt:new Date()};
  const r=await db().collection("issues").insertOne(doc);
  await sendEmail([adminEmail,process.env.ORDER_ALERT_EMAIL].filter(Boolean),"Woodberry issue #"+String(r.insertedId).slice(-8),"<h3>New issue</h3><p>"+type+"</p><pre>"+message.replace(/[&<>]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[x]))+"</pre>");
  res.status(201).json({id:String(r.insertedId),status:"open"});
 }));
 app.get("/api/issues",auth,safe(async(req,res)=>{
  await connect();const items=await db().collection("issues").find({userId:uid(req)}).sort({createdAt:-1}).limit(40).toArray();res.json({issues:items.map(x=>({...x,_id:String(x._id)}))});
 }));
 app.post("/api/orders/:orderId/return",auth,safe(async(req,res)=>{
  await connect();const _id=id(req.params.orderId);if(!_id)return res.status(400).json({error:"Invalid order"});
  const reason=clean(req.body.reason,1000);
  if(reason.length<12)return res.status(400).json({error:"Explain the return reason (12+ characters)."});
  const o=await db().collection("orders").findOne({_id,userId:uid(req)});
  if(!o)return res.status(404).json({error:"Order not found"});
  if(!["delivered","shipped"].includes(o.orderStatus))return res.status(400).json({error:"Returns can be requested after shipping/delivery."});
  const history=[...(o.history||[]),{status:"return_requested",note:reason,at:new Date(),by:"customer"}];
  await db().collection("orders").updateOne({_id},{$set:{orderStatus:"return_requested",returnReason:reason,history,updatedAt:new Date()}});
  await sendEmail([adminEmail,process.env.ORDER_ALERT_EMAIL].filter(Boolean),"Woodberry return requested", "<p>Order "+String(_id)+" has a return request.</p><p>"+reason+"</p>");
  res.json({ok:true,status:"return_requested"});
 }));
 app.get("/api/orders/:orderId/tracking",auth,safe(async(req,res)=>{
  await connect();const _id=id(req.params.orderId);if(!_id)return res.status(400).json({error:"Invalid order"});
  const o=await db().collection("orders").findOne({_id,userId:uid(req)},{projection:{orderStatus:1,paymentStatus:1,history:1,tracking:1,createdAt:1,total:1}});
  if(!o)return res.status(404).json({error:"Order not found"});
  res.json({orderStatus:o.orderStatus,paymentStatus:o.paymentStatus,history:o.history||[{status:"placed",at:o.createdAt,by:"store"}],tracking:o.tracking||null,steps:shippingStatus});
 }));
 app.get("/api/admin/commerce",admin,safe(async(req,res)=>{
  await connect();
  const [issues,coupons,orders,products,users]=await Promise.all([
   db().collection("issues").find({}).sort({createdAt:-1}).limit(120).toArray(),
   db().collection("coupons").find({}).sort({createdAt:-1}).limit(100).toArray(),
   db().collection("orders").find({}).sort({createdAt:-1}).limit(150).toArray(),
   db().collection("products").find({}).sort({createdAt:-1}).limit(150).toArray(),
   db().collection("users").find({},{projection:{name:1,email:1,phone:1,deletedReason:1,createdAt:1}}).sort({createdAt:-1}).limit(150).toArray()
  ]);
  res.json({issues,coupons,orders,products,users});
 }));
 app.post("/api/admin/coupons",admin,safe(async(req,res)=>{
  await connect();
  const code=clean(req.body.code,36).toUpperCase().replace(/[^A-Z0-9_-]/g,"");
  const amount=Math.floor(Number(req.body.amount)||0),limit=Math.floor(Number(req.body.limit)||0);
  if(!code||amount<1||amount>10000||limit<1||limit>100000)return res.status(400).json({error:"Valid coupon code, amount and usage limit required."});
  const coupon={code,amount,limit,used:0,active:true,minSpend:Math.max(0,Number(req.body.minSpend)||0),expiresAt:req.body.expiresAt?new Date(req.body.expiresAt):null,createdAt:new Date(),kind:"admin"};
  await db().collection("coupons").insertOne(coupon);res.status(201).json({coupon:couponDTO(coupon)});
 }));
 app.patch("/api/admin/coupons/:code",admin,safe(async(req,res)=>{
  await connect();const code=clean(req.params.code,36).toUpperCase();
  const updates={updatedAt:new Date()};
  if(req.body.active!==undefined)updates.active=req.body.active===true;
  if(req.body.limit!==undefined)updates.limit=Math.max(0,Math.floor(Number(req.body.limit)));
  const r=await db().collection("coupons").updateOne({code},{$set:updates});
  if(!r.matchedCount)return res.status(404).json({error:"Coupon not found"});
  res.json({ok:true});
 }));
 app.post("/api/admin/issues/:id",admin,safe(async(req,res)=>{
  await connect();const _id=id(req.params.id),issue=await db().collection("issues").findOne({_id});
  if(!issue)return res.status(404).json({error:"Issue not found"});
  const status=["open","reviewing","resolved","rejected"].includes(req.body.status)?req.body.status:"reviewing";
  await db().collection("issues").updateOne({_id},{$set:{status,adminNote:clean(req.body.note,1000),updatedAt:new Date()}});
  if(req.body.couponAmount){const amount=Number(req.body.couponAmount);if(amount>0&&amount<=1000)await grant(issue.userId,"issue",amount,{issueId:_id})}
  await notify(issue.userId,"Issue "+status,"Your report was updated.");
  res.json({ok:true});
 }));
 app.post("/api/admin/mail",admin,safe(async(req,res)=>{
  await connect();const recipient=clean(req.body.email,180).toLowerCase(),subject=clean(req.body.subject,150),body=clean(req.body.message,3000);
  const u=await db().collection("users").findOne({email:recipient});
  if(!u||subject.length<3||body.length<3)return res.status(400).json({error:"Select a registered user, subject and message."});
  await sendEmail([recipient],subject,"<div style='font-family:sans-serif;white-space:pre-wrap'>"+body.replace(/[&<>]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[x]))+"</div>");
  res.json({ok:true});
 }));
 app.post("/api/admin/orders/:id/action",admin,safe(async(req,res)=>{
  await connect();const _id=id(req.params.id),o=await db().collection("orders").findOne({_id});
  if(!o)return res.status(404).json({error:"Order not found"});
  const status=clean(req.body.status,40);
  if(!orderStatus.includes(status))return res.status(400).json({error:"Invalid order status"});
  const note=clean(req.body.note,500),tracking=req.body.tracking&&typeof req.body.tracking==="object"?
   {carrier:clean(req.body.tracking.carrier,100),number:clean(req.body.tracking.number,120),url:clean(req.body.tracking.url,500)}:o.tracking||null;
  if(status==="refunded"&&o.paymentMethod==="razorpay")return res.status(409).json({error:"Online refunds must be executed through the payment gateway before marking refunded. This action cannot initiate a Razorpay refund."});
  const history=[...(o.history||[]),{status,at:new Date(),note,by:"admin"}];
  const updates={orderStatus:status,tracking,history,updatedAt:new Date()};
  if(status==="refunded"&&o.paymentMethod==="cod")updates.paymentStatus="refunded";
  await db().collection("orders").updateOne({_id},{$set:updates});
  await notify(o.userId,"Order "+status,"Your order #"+String(_id).slice(-8).toUpperCase()+" is "+status.replaceAll("_"," ")+(note?". "+note:""));
  const user=o.userId?await db().collection("users").findOne({_id:o.userId}):null;
  if(user?.email)await sendEmail([user.email],"Woodberry order "+status,"<p>Order #"+String(_id).slice(-8).toUpperCase()+" is now <b>"+status.replaceAll("_"," ")+"</b>.</p><p>"+note+"</p>");
  res.json({ok:true,status,tracking,history});
 }));
 app.patch("/api/admin/inventory/:id",admin,safe(async(req,res)=>{
  await connect();const _id=id(req.params.id),stock=Number(req.body.stock);
  if(!_id||!Number.isInteger(stock)||stock<0||stock>100000)return res.status(400).json({error:"Enter valid stock quantity"});
  const p=await db().collection("products").findOne({_id});
  if(!p)return res.status(404).json({error:"Product not found"});
  await db().collection("products").updateOne({_id},{$set:{stock,updatedAt:new Date()},$push:{stockHistory:{from:p.stock||0,to:stock,note:clean(req.body.note,180)||"Admin inventory adjustment",at:new Date()}}});
  res.json({ok:true,stock});
 }));
 app.post("/api/admin/delete-user/request-otp",admin,safe(async(req,res)=>{
  await connect();
  await sendOtpEmail(adminEmail,"admin_delete","Administrator");res.json({ok:true,message:"Verification code sent to admin email"});
 }));
 app.post("/api/admin/users/:id/delete",admin,safe(async(req,res)=>{
  await connect();const _id=id(req.params.id),reason=clean(req.body.reason,800),code=clean(req.body.code,6);
  if(!_id||reason.length<10)return res.status(400).json({error:"Provide a valid user and deletion reason of at least 10 characters"});
  await verifyOtp(adminEmail,"admin_delete",code);
  const u=await db().collection("users").findOne({_id});
  if(!u)return res.status(404).json({error:"User not found"});
  await db().collection("deleted_accounts").insertOne({email:u.email,emailHash:crypto.createHash("sha256").update(u.email.toLowerCase()).digest("hex"),reason,deletedAt:new Date(),deletedBy:adminEmail});
  await db().collection("users").deleteOne({_id});
  await db().collection("notifications").deleteMany({userId:_id});
  await sendEmail([u.email],"Woodberry Sports account status","<p>Your account was closed by the store administrator.</p><p>Reason: "+reason.replace(/[&<>]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[x]))+"</p><p>Contact support to appeal this decision.</p>");
  res.json({ok:true});
 }));
 app.get("/api/account/status",safe(async(req,res)=>{
  await connect();const email=clean(req.query.email,180).toLowerCase();
  if(!email)return res.json({deleted:false});
  // Do not reveal private deletion reasons without authentication.
  res.json({deleted:false,message:"For closed-account enquiries, contact Woodberry Sports support."});
 }));
 return {completeProfile,issueReferral,grant};
};