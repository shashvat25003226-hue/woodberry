"use strict";
const safeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function wbRequest(url,options={}){const response=await fetch(url,{headers:{"Content-Type":"application/json"},...options});const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.error||"Request could not be completed");return body}
function wbToast(msg){if(typeof toast==="function")toast(msg);else alert(msg)}
function wbModalAccount(){try{if(typeof openAccount==="function")openAccount()}catch(err){wbToast(err.message)}}
function wbModalNotification(){try{if(typeof showNotifications==="function")showNotifications()}catch(err){wbToast(err.message)}}
function wbAccountButtons(){
 const a=document.querySelector("#accountBtn"),n=document.querySelector("#notifyBtn");
 if(a)a.onclick=wbModalAccount;if(n)n.onclick=wbModalNotification;
}
wbAccountButtons();
async function wbBenefits(parent){
 if(!S.user)return;
 const root=document.createElement("section");root.className="benefits-panel";
 root.innerHTML='<h3>Rewards & account setup</h3><div class="skeleton-line"></div>';
 parent.append(root);
 try{
  const r=await wbRequest("/api/me/benefits");
  const done=Object.values(r.profileChecklist||{}).filter(Boolean).length,total=Object.keys(r.profileChecklist||{}).length;
  root.innerHTML='<h3>Rewards & account setup</h3><p>'+done+'/'+total+' profile steps complete · Get ₹100 off when your verified account, name, phone, address and photo are complete.</p><div class="progress-track"><div style="width:'+Math.round(100*done/Math.max(total,1))+'%"></div></div><p>Your referral code: <b>'+safeHTML(r.referralCode)+'</b> <button class="text-action" id="copyReferral">Copy</button></p><p>Invite a friend. When they verify registration with your code, you receive ₹150 off and they receive ₹100 off.</p><h4>Your coupons</h4>'+(r.coupons?.length?r.coupons.map(c=>'<div class="reward-coupon"><b>'+safeHTML(c.code)+'</b> ₹'+Number(c.amount)+' off</div>').join(""):'<p>No rewards unlocked yet.</p>');
  const btn=root.querySelector("#copyReferral");if(btn)btn.onclick=async()=>{await navigator.clipboard.writeText(r.referralCode);wbToast("Referral code copied")};
 }catch(err){root.innerHTML='<h3>Rewards & account setup</h3><p>'+safeHTML(err.message)+'</p>'}
}
async function wbReports(parent){
 const sec=document.createElement("section");sec.className="report-panel";
 sec.innerHTML='<h3>Report an issue</h3><form id="wbReport"><label>Category<select name="type"><option value="bug">Website bug</option><option value="order">Order problem</option><option value="product">Product enquiry</option><option value="other">Other</option></select></label><label>What happened?<textarea name="message" rows="3" minlength="12" placeholder="Describe the problem so the team can investigate" required></textarea></label><button class="button ghost">Send report</button></form><small>Reports are reviewed by the team. A discount coupon may be issued by an administrator where appropriate.</small><div id="wbIssueList"></div>';
 parent.append(sec);
 sec.querySelector("#wbReport").onsubmit=async event=>{event.preventDefault();const f=new FormData(event.target);try{await wbRequest("/api/issues",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});wbToast("Report submitted");event.target.reset();wbLoadIssues(sec)}catch(err){wbToast(err.message)}};
 wbLoadIssues(sec);
}
async function wbLoadIssues(sec){try{const x=await wbRequest("/api/issues");sec.querySelector("#wbIssueList").innerHTML=(x.issues||[]).slice(0,5).map(i=>'<div class="issue-item"><b>'+safeHTML(i.type)+'</b> · '+safeHTML(i.status)+'<p>'+safeHTML(i.message).slice(0,160)+'</p></div>').join("")}catch{}}
const originalOpenAccount=openAccount;
openAccount=function(){
 originalOpenAccount();
 const box=document.querySelector("#accountExtra");if(!box||!S.user)return;
 wbBenefits(box);wbReports(box);
};
const originalShowOrders=showOrders;
showOrders=async function(){
 await originalShowOrders();
 const orders=await wbRequest("/api/orders").catch(()=>({orders:[]}));
 const root=document.querySelector("#accountExtra");if(!root)return;
 root.innerHTML='<h3>Your orders & tracking</h3>'+(orders.orders||[]).map(o=>'<article class="order-track-card"><div><b>#'+safeHTML(String(o._id).slice(-8).toUpperCase())+'</b> · ₹'+Number(o.total||0)+' · '+safeHTML(o.orderStatus)+'</div><p>Payment: '+safeHTML(o.paymentStatus)+' · '+safeHTML(o.paymentMethod)+'</p><button class="button ghost" data-track="'+safeHTML(o._id)+'">Tracking details</button> '+(['delivered','shipped'].includes(o.orderStatus)?'<button class="button ghost" data-return="'+safeHTML(o._id)+'">Request return</button>':'')+'<div class="tracking-result"></div></article>').join("")||'<p class="empty">No orders yet.</p>';
 root.querySelectorAll("[data-track]").forEach(b=>b.onclick=async()=>{const el=b.closest(".order-track-card").querySelector(".tracking-result");el.innerHTML='<div class="skeleton-line"></div>';try{const d=await wbRequest("/api/orders/"+b.dataset.track+"/tracking");el.innerHTML='<h4>Tracking timeline</h4>'+(d.history||[]).map(h=>'<div class="track-step"><b>'+safeHTML(h.status).replaceAll("_"," ")+'</b> <small>'+safeHTML(new Date(h.at).toLocaleString("en-IN"))+'</small><p>'+safeHTML(h.note||"")+'</p></div>').join("")+(d.tracking?.number?'<p>Carrier: '+safeHTML(d.tracking.carrier||"")+' · '+safeHTML(d.tracking.number)+'</p>':'')+(d.tracking?.url?.startsWith("https://")?'<a href="'+safeHTML(d.tracking.url)+'" target="_blank" rel="noopener noreferrer">Open courier tracking</a>':'')}catch(e){el.textContent=e.message}});
 root.querySelectorAll("[data-return]").forEach(b=>b.onclick=async()=>{const reason=prompt("Describe why you want to return this bat (12+ characters):");if(!reason)return;try{await wbRequest("/api/orders/"+b.dataset.return+"/return",{method:"POST",body:JSON.stringify({reason})});wbToast("Return request submitted");showOrders()}catch(e){wbToast(e.message)}});
};
function wbReportShortcut(){
 const link=document.createElement("a");link.className="bug-fab";link.textContent="Report a problem";link.href="#";link.onclick=event=>{event.preventDefault();if(!S.user){wbModalAccount();wbToast("Please sign in to report an issue");return}wbModalAccount();document.querySelector(".report-panel")?.scrollIntoView({behavior:"smooth",block:"center"})};
 document.body.append(link);
}
wbReportShortcut();
