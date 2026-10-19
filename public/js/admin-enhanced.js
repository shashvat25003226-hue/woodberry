"use strict";
const legacyDashboard=dashboard;
dashboard=async function(){
 await legacyDashboard();
 const root=document.querySelector("#adminRoot");
 if(!root||!document.querySelector("#newProduct"))return;
 const section=document.createElement("section");section.className="admin-extras";
 section.innerHTML='<div class="section-head"><div><span class="eyebrow">OPERATIONS</span><h2>Order control & inventory</h2></div><button class="button ghost" id="opsRefresh">Refresh data</button></div><p class="muted-copy">Update an order or its tracking information without reloading the page. Online payment refunds must be completed and verified at the payment gateway before marking refunded.</p><div id="opsOrders" class="ops-stack">Loading orders...</div><div class="section-head"><h2>Inventory</h2></div><div id="opsInventory" class="ops-stack"></div><div class="section-head"><h2>Coupons</h2></div><form id="opsCoupon" class="ops-form"><label>Code<input name="code" required placeholder="WOODBERRY100"></label><label>Amount (₹)<input name="amount" type="number" min="1" max="10000" required></label><label>Usage limit<input name="limit" type="number" min="1" value="100" required></label><label>Minimum spend<input name="minSpend" type="number" min="0" value="1000"></label><button class="button primary">Create coupon</button></form><div id="opsCoupons"></div><div class="section-head"><h2>Customer issue reports</h2></div><div id="opsIssues"></div><div class="section-head"><h2>Send customer email</h2></div><form id="opsMail"><label>Customer email<input name="email" type="email" required></label><label>Subject<input name="subject" required maxlength="150"></label><label>Message<textarea name="message" rows="4" required></textarea></label><button class="button primary">Send email</button></form><div class="section-head"><h2>Customer accounts</h2></div><p class="muted-copy">Account deletion requires a verification code sent to the administrator email and a recorded deletion reason.</p><div id="opsUsers"></div>';
 root.append(section);
 // Override the old order status handler: use the new tracked workflow.
 document.querySelectorAll("[data-order]").forEach(el=>el.disabled=true);
 document.querySelector("#opsRefresh").onclick=()=>loadOperations();
 document.querySelector("#opsCoupon").onsubmit=async event=>{event.preventDefault();const f=new FormData(event.target);await opsAction("/api/admin/coupons","POST",Object.fromEntries(f));event.target.reset();await loadOperations()};
 document.querySelector("#opsMail").onsubmit=async event=>{event.preventDefault();const f=new FormData(event.target);const result=await opsAction("/api/admin/mail","POST",Object.fromEntries(f));if(result){event.target.reset();toast("Email request processed")}};
 // Integrate drag-and-drop image upload in existing product editor.
 if(!window.__woodberryDropHook){window.__woodberryDropHook=true;const originalEdit=editProduct;
 editProduct=function(p){originalEdit(p);const inp=document.querySelector("#pFiles");if(!inp)return;const drop=document.createElement("div");drop.className="upload-drop";drop.tabIndex=0;drop.innerHTML='<b>Drop bat photos here</b><small>JPG, PNG, WebP · original image bytes are preserved</small><span id="dropCount">No new photos selected</span>';inp.parentNode.insertAdjacentElement("afterend",drop);
 const show=()=>document.querySelector("#dropCount").textContent=inp.files.length+" image(s) selected";
 inp.onchange=show;drop.onclick=()=>inp.click();drop.onkeydown=e=>{if(e.key==="Enter")inp.click()};drop.ondragover=e=>{e.preventDefault();drop.classList.add("active")};drop.ondragleave=()=>drop.classList.remove("active");drop.ondrop=e=>{e.preventDefault();drop.classList.remove("active");if(e.dataTransfer.files.length){inp.files=e.dataTransfer.files;show()}}};
 };
 await loadOperations();
};
async function opsAction(url,method,body){
 try{return await api(url,{method,body:JSON.stringify(body)})}
 catch(e){toast(e.message);return null}
}
const opsEscape=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const opsDate=x=>x?new Date(x).toLocaleString("en-IN"):"";
async function loadOperations(){
 const data=await api("/api/admin/commerce").catch(e=>{toast(e.message);return null});if(!data)return;
 const steps=["placed","confirmed","rejected","processing","packed","shipped","out_for_delivery","delivered","return_requested","return_approved","return_rejected","returned","refund_pending","refunded","cancelled"];
 document.querySelector("#opsOrders").innerHTML=(data.orders||[]).map(o=>{
 const id=String(o._id),selected=o.orderStatus||"placed",track=o.tracking||{};
 return '<article class="ops-card" data-ops-order="'+opsEscape(id)+'"><div class="ops-card-top"><b>#'+opsEscape(id.slice(-8).toUpperCase())+'</b><span>'+opsEscape(money(o.total))+'</span><small>'+opsEscape(o.paymentMethod)+" · "+opsEscape(o.paymentStatus)+'</small></div><div class="ops-inline"><label>Decision / status<select data-field="status">'+steps.map(s=>'<option '+(s===selected?'selected':'')+' value="'+s+'">'+s.replaceAll("_"," ")+'</option>').join("")+'</select></label><label>Carrier<input data-field="carrier" placeholder="Courier" value="'+opsEscape(track.carrier||"")+'"></label><label>Tracking number<input data-field="number" value="'+opsEscape(track.number||"")+'"></label><label>Tracking URL<input data-field="url" type="url" value="'+opsEscape(track.url||"")+'"></label></div><label>Customer note<input data-field="note" placeholder="Optional order update message"></label><button class="button primary" data-save-order>Save order update</button> <button class="button ghost" data-initiate-refund type="button">Initiate verified refund</button> <button class="button ghost" data-check-refund type="button">Check refund</button><span class="inline-result" aria-live="polite"></span></article>';
 }).join("")||'<p class="empty">No orders yet.</p>';
 document.querySelectorAll("[data-save-order]").forEach(b=>b.onclick=async()=>{
 const card=b.closest("[data-ops-order]"),val=f=>card.querySelector('[data-field="'+f+'"]').value;
 b.disabled=true;b.textContent="Saving…";
 let refundReference="",confirmRefund=false;
 if(val("status")==="refunded"){
  refundReference=prompt("Enter the completed COD refund reference (online refunds must use the Razorpay action):")||"";
  if(!refundReference){b.disabled=false;b.textContent="Save order update";return}
  confirmRefund=confirm("Confirm the money was actually sent back to the customer?");
  if(!confirmRefund){b.disabled=false;b.textContent="Save order update";return}
 }
 const result=await opsAction("/api/admin/orders/"+card.dataset.opsOrder+"/action","POST",{status:val("status"),note:val("note"),refundReference,confirmRefund,tracking:{carrier:val("carrier"),number:val("number"),url:val("url")}});
 b.disabled=false;b.textContent="Save order update";if(result){card.querySelector(".inline-result").textContent="Saved · "+opsDate(new Date());toast("Order updated without page reload")}
 });
 document.querySelectorAll("[data-initiate-refund]").forEach(b=>b.onclick=async()=>{
 const order=b.closest("[data-ops-order]").dataset.opsOrder;
 if(!confirm("Initiate a Razorpay refund for this verified online payment? This will contact the payment provider."))return;
 const result=await opsAction("/api/admin/orders/"+order+"/refund","POST",{});
 if(result){b.closest("[data-ops-order]").querySelector(".inline-result").textContent="Refund request "+result.refundId+" · "+result.status;toast("Refund initiated")}
 });
 document.querySelectorAll("[data-check-refund]").forEach(b=>b.onclick=async()=>{
 const order=b.closest("[data-ops-order]").dataset.opsOrder;
 const result=await opsAction("/api/admin/orders/"+order+"/refund/check","POST",{});
 if(result){b.closest("[data-ops-order]").querySelector(".inline-result").textContent="Refund status: "+result.status;toast("Refund status checked")}
 });
 document.querySelector("#opsInventory").innerHTML=(data.products||[]).map(p=>'<div class="ops-inventory"><strong>'+opsEscape(p.name)+'</strong><label>Available stock<input type="number" min="0" value="'+Number(p.stock||0)+'" data-inv-count></label><input placeholder="Reason for adjustment" data-inv-note><button class="button ghost" data-stock="'+String(p._id)+'">Save</button></div>').join("");
 document.querySelectorAll("[data-stock]").forEach(b=>b.onclick=async()=>{const row=b.closest(".ops-inventory");const result=await opsAction("/api/admin/inventory/"+b.dataset.stock,"PATCH",{stock:Number(row.querySelector("[data-inv-count]").value),note:row.querySelector("[data-inv-note]").value});if(result)toast("Stock saved")});
 document.querySelector("#opsCoupons").innerHTML=(data.coupons||[]).map(c=>'<div class="ops-row"><b>'+opsEscape(c.code)+'</b><span>'+money(c.amount)+' off · '+Number(c.used||0)+'/'+Number(c.limit||0)+' used</span><button class="button ghost" data-coupon="'+opsEscape(c.code)+'">'+(c.active===false?"Enable":"Disable")+'</button></div>').join("")||'<p class="empty">No coupons.</p>';
 document.querySelectorAll("[data-coupon]").forEach(b=>b.onclick=async()=>{const active=b.textContent==="Enable";const result=await opsAction("/api/admin/coupons/"+encodeURIComponent(b.dataset.coupon),"PATCH",{active});if(result){b.textContent=active?"Disable":"Enable";toast("Coupon updated")}});
 document.querySelector("#opsIssues").innerHTML=(data.issues||[]).map(i=>'<div class="ops-card"><b>'+opsEscape(i.type)+' · '+opsEscape(i.status)+'</b><p>'+opsEscape(i.message)+'</p><small>'+opsEscape(i.email)+'</small><div class="ops-inline"><select data-issue-status><option>reviewing</option><option>resolved</option><option>rejected</option><option>open</option></select><input data-issue-note placeholder="Admin notes"><input data-issue-coupon type="number" min="0" max="1000" placeholder="Optional reward ₹"><button class="button ghost" data-issue="'+i._id+'">Update</button></div></div>').join("")||'<p class="empty">No reports.</p>';
 document.querySelectorAll("[data-issue]").forEach(b=>b.onclick=async()=>{const row=b.closest(".ops-card");const result=await opsAction("/api/admin/issues/"+b.dataset.issue,"POST",{status:row.querySelector("[data-issue-status]").value,note:row.querySelector("[data-issue-note]").value,couponAmount:Number(row.querySelector("[data-issue-coupon]").value)||0});if(result)loadOperations()});
 document.querySelector("#opsUsers").innerHTML=(data.users||[]).map(u=>'<div class="ops-row"><span><b>'+opsEscape(u.name)+'</b><small>'+opsEscape(u.email)+'</small></span><button class="button ghost danger" data-delete-user="'+u._id+'">Delete with OTP</button></div>').join("")||'<p class="empty">No users.</p>';
 document.querySelectorAll("[data-delete-user]").forEach(b=>b.onclick=async()=>{
 const reason=prompt("Enter the reason for account deletion (sent to the user):");if(!reason||reason.length<10){toast("At least 10 characters required");return}
 const challenge=await opsAction("/api/admin/delete-user/request-otp","POST",{});if(!challenge)return;
 const code=prompt("Enter the 6-digit OTP sent to the administrator email:");if(!code)return;
 const result=await opsAction("/api/admin/users/"+b.dataset.deleteUser+"/delete","POST",{reason,code});
 if(result){toast("Account deletion processed");loadOperations()}
 });
}
