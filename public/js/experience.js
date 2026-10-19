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
 root.innerHTML='<div class="account-loading"><div class="skeleton-line"></div><div class="skeleton-line"></div></div>';
 parent.append(root);
 try{
  const r=await wbRequest("/api/me/benefits");
  if(!root.isConnected)return;
  const checklist=r.profileChecklist||{};
  const keys=[["name","Name"],["phone","Phone"],["address","Address"],["photo","Photo"],["email","Email"]];
  const done=keys.filter(([key])=>!!checklist[key]).length;
  const ready=done===keys.length;
  const coupons=(r.coupons||[]).map(x=>'<div class="coupon-card"><div><small>WOODBERRY REWARDS</small><b>'+safeHTML(x.code)+'</b></div><strong>₹'+Number(x.amount||0).toLocaleString("en-IN")+' off</strong></div>').join("");
  root.innerHTML='<div class="rewards-card">'+
  '<div class="rewards-topline"><span class="account-kicker">EXCLUSIVE MEMBER BENEFITS</span><span class="reward-emblem">✦</span></div>'+
  '<div class="rewards-heading"><div><h3>Better cricket, better rewards.</h3><p>'+(ready?'Your account setup is complete.':'Complete your profile to unlock your ₹100 reward.')+'</p></div><span class="reward-amount">₹100 <small>OFF</small></span></div>'+
  '<div class="progress-label"><span>Profile completion</span><strong>'+done+' / '+keys.length+' steps</strong></div>'+
  '<div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="5" aria-valuenow="'+done+'" aria-label="Profile completion"><div style="width:'+Math.round(100*done/keys.length)+'%"></div></div>'+
  '<div class="profile-checklist">'+keys.map(([key,label])=>'<span class="check-chip '+(checklist[key]?'done':'')+'"><span>'+(checklist[key]?'✓':'○')+'</span>'+label+'</span>').join("")+'</div>'+
  '<div class="referral-card"><div><span class="account-kicker">INVITE & EARN</span><h4>Give ₹100. Get ₹150.</h4><p>Share your referral code with a friend.</p></div><div class="referral-code-wrap"><code>'+safeHTML(r.referralCode||"")+'</code><button type="button" id="copyReferral" class="copy-btn">Copy code</button></div></div>'+
  '<div class="coupon-section"><div class="coupon-section-heading"><h4>Your coupons</h4><span>'+Number(r.coupons?.length||0)+' available</span></div>'+(coupons||'<p class="coupons-empty">Rewards you unlock will appear here.</p>')+'</div></div>';
  const btn=root.querySelector("#copyReferral");
  if(btn)btn.onclick=async()=>{try{await navigator.clipboard.writeText(r.referralCode);wbToast("Referral code copied")}catch{wbToast("Select and copy: "+r.referralCode)}};
 }catch(err){if(root.isConnected)root.innerHTML='<div class="rewards-card"><h3>Rewards</h3><p class="muted-copy">Rewards are temporarily unavailable. Your account is still accessible.</p></div>'}
}
async function wbReports(parent){
 const sec=document.createElement("section");sec.className="report-panel";
 sec.innerHTML='<details class="support-accordion"><summary><span><b>Need help?</b><small>Report an issue or get support</small></span><span class="support-arrow">⌄</span></summary><div class="support-inner"><form id="wbReport"><label>What can we help with?<select name="type"><option value="bug">Website problem</option><option value="order">Order problem</option><option value="product">Product enquiry</option><option value="other">Something else</option></select></label><label>Tell us more<textarea name="message" rows="3" minlength="12" placeholder="Describe the issue in a few words" required></textarea></label><button class="button primary" type="submit">Submit report</button></form><p class="support-footnote">Our team reviews every report. We may offer a coupon when appropriate.</p><div id="wbIssueList"></div></div></details>';
 parent.append(sec);
 sec.querySelector("#wbReport").onsubmit=async event=>{event.preventDefault();const f=new FormData(event.target);try{await wbRequest("/api/issues",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});wbToast("Report submitted");event.target.reset();wbLoadIssues(sec)}catch(err){wbToast(err.message)}};
 sec.querySelector("details").addEventListener("toggle",()=>{if(sec.querySelector("details").open)wbLoadIssues(sec)});
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
