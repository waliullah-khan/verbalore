/* eslint-disable */
// @ts-nocheck
/* The pixel arena from the Studio Lot design: the crew sprites, the Blank Page boss and the stage they fight on.
   The drawing code is the design's own. It is wrapped so it only touches the page when asked (it needs a canvas),
   which keeps it safe to import from a component that is also rendered on the server. */
import gsap from "gsap";

export function hexc(h){if(h.charAt(0)==='r')return h.match(/\d+/g).slice(0,3).map(Number);return [1,3,5].map(function(i){return parseInt(h.substr(i,2),16)})}
export function mix(a,b,t){var A=hexc(a),B=hexc(b);return 'rgb('+A.map(function(v,i){return Math.round(v+(B[i]-v)*t)}).join(',')+')'}

// Day and night. T.tod is 0 by day and 1 by night, and the stage colours blend between the two.
export var T={tod:0};
export function M(d,n){return mix(d,n,T.tod)}
export function watchTime(reduce){
  var root=document.documentElement,mq=window.matchMedia('(prefers-color-scheme: dark)');
  function isDark(){var t=root.getAttribute('data-theme');return t?t==='dark':mq.matches}
  T.tod=isDark()?1:0;
  var go=function(){gsap.to(T,{tod:isDark()?1:0,duration:reduce?0:.8})};
  var mo=new MutationObserver(go);mo.observe(root,{attributes:true,attributeFilter:['data-theme']});
  if(mq.addEventListener)mq.addEventListener('change',go);
  return function(){mo.disconnect();if(mq.removeEventListener)mq.removeEventListener('change',go)};
}

export function bake(w,h,fn){var c=document.createElement('canvas');c.width=w+2;c.height=h+2;var x=c.getContext('2d');x.translate(1,1);fn(x);x.setTransform(1,0,0,1,0,0);var d=x.getImageData(0,0,c.width,c.height),a=d.data,src=new Uint8ClampedArray(a),W=c.width,H=c.height;
  for(var y=0;y<H;y++)for(var px=0;px<W;px++){var i=(y*W+px)*4;if(src[i+3]!==0)continue;var n=(px>0&&src[i-1]>0)||(px<W-1&&src[i+7]>0)||(y>0&&src[i-W*4+3]>0)||(y<H-1&&src[i+W*4+3]>0);if(n){a[i]=13;a[i+1]=11;a[i+2]=43;a[i+3]=255}}
  x.putImageData(d,0,0);return c}
export function whiten(c){var n=document.createElement('canvas');n.width=c.width;n.height=c.height;var x=n.getContext('2d');x.drawImage(c,0,0);x.globalCompositeOperation='source-in';x.fillStyle='#fff';x.fillRect(0,0,n.width,n.height);return n}

var spr={};
export function charSprite(l,f){var k=JSON.stringify(l)+f;if(spr[k])return spr[k];var s=bake(12,17,function(x){var R=function(a,b,w,h,c){x.fillStyle=c;x.fillRect(a,b,w,h)},ink='#161433';R(3,2,6,6,l.skin);if(l.style==='cap'){R(2,1,8,3,l.prop);R(8,3,3,1,l.prop)}else if(l.style==='bun'){R(3,1,6,3,l.hair);R(2,3,1,4,l.hair);R(9,3,1,4,l.hair);R(5,-1,3,2,l.hair)}else{R(3,1,6,3,l.hair);R(2,2,1,4,l.hair);R(9,2,1,4,l.hair)}R(4,5,1,1,ink);R(7,5,1,1,ink);R(2,8,8,5,l.shirt);R(1,8,1,4,l.shirt);R(10,8,1,4,l.shirt);R(1,12,1,1,l.skin);R(10,12,1,1,l.skin);var lo=f?1:0;R(3,13,3,2+lo,l.pants);R(6,13,3,3-lo,l.pants);R(3,15+lo,3,1,ink);R(6,16-lo,3,1,ink)});spr[k]=s;return s}

var _boss=null,_white=null;
export function bossSprites(){
  if(!_boss){
    _boss=bake(40,44,function(x){var R=function(a,b,w,h,c){x.fillStyle=c;x.fillRect(a,b,w,h)},ink='#161433';R(4,2,32,36,'#fbfbff');R(4,34,32,4,'#dfe3f2');R(33,2,3,36,'#e7eaf6');for(var py=30;py<38;py++)for(var px=28;px<36;px++){var s=(px-28)+(py-30);if(s>=8)x.clearRect(px,py,1,1);else if(s>=6)R(px,py,1,1,'#c3c9e0')}R(2,0,9,4,'#ffd45a');R(29,0,9,4,'#ffd45a');R(10,12,7,8,ink);R(23,12,7,8,ink);R(12,14,2,2,'#fff');R(25,14,2,2,'#fff');for(var i=0;i<8;i++){R(9+i,8+(i>>1),1,2,ink);R(30-i,8+(i>>1),1,2,ink)}R(12,28,16,6,ink);R(14,28,3,2,'#fff');R(19,28,3,2,'#fff');R(24,28,3,2,'#fff');R(17,32,6,2,'#ff5a7a');R(0,22,5,3,'#ffd45a');R(35,22,5,3,'#ffd45a');R(12,38,4,5,'#ffd45a');R(24,38,4,5,'#ffd45a');R(12,42,4,2,'#ff7a9c');R(24,42,4,2,'#ff7a9c')});
    _white=whiten(_boss);
  }
  return {boss:_boss,white:_white};
}
export function drawBossIcon(cv){var x=cv.getContext('2d');x.imageSmoothingEnabled=false;x.clearRect(0,0,42,46);x.drawImage(bossSprites().boss,0,0)}

// The looks the design gives its crew. The first is the person looking at the screen.
export var LOOKS=[
 {hair:'#3b2a20',style:'flat',skin:'#f2c9a0',shirt:'#ff8f6b',pants:'#2b3a67',prop:'#ffd45a'},
 {hair:'#161433',style:'cap',skin:'#c68e5f',shirt:'#3b7bff',pants:'#2a2a3a',prop:'#ff7a5c'},
 {hair:'#2b2b2b',style:'bun',skin:'#8d5a3b',shirt:'#3fd1bb',pants:'#3a3a55',prop:'#ffc933'},
 {hair:'#d9602b',style:'flat',skin:'#f2c9a0',shirt:'#9be37a',pants:'#33405e',prop:'#ffc933'}
];

// AR is the live state of the fight: who is attacking, how far along the lunge is, and the hit flash and shake.
export function newArena(){return {ctx:null,atk:-1,p:0,flash:0,shake:0,fade:1,dead:false,bx:190,by:84}}

function RR(c,x,y,w,h,col){c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),w,h)}
export function drawArena(AR,looks,time,reduce){
  var c=AR.ctx;if(!c)return;var tt=reduce?0:time,SW=320,SH=180,sp3=bossSprites();
  RR(c,0,0,SW,SH,M('#4a63b8','#171447'));for(var i=0;i<6;i++)RR(c,0,i*20,SW,20,mix(M('#4a63b8','#171447'),M('#6b84d8','#232066'),i/5));
  var cur=M('#e03a4e','#8c1f3b'),cur2=M('#b82a3d','#6a1530');for(var x=0;x<50;x+=6){RR(c,x,0,3,SH-48,cur);RR(c,x+3,0,3,SH-48,cur2);RR(c,SW-50+x,0,3,SH-48,cur);RR(c,SW-47+x,0,3,SH-48,cur2)}
  RR(c,0,0,SW,10,M('#c42e44','#7a1a38'));RR(c,0,SH-48,SW,48,M('#c98f4a','#4a2f2a'));for(var y=SH-48;y<SH;y+=8)RR(c,0,y,SW,1,M('#a8742f','#331f1c'));
  c.globalAlpha=.1+.16*T.tod;c.fillStyle='#fff6c9';[90,250].forEach(function(sx,k){var sw=Math.sin(tt*.8+k*2)*14;c.beginPath();c.moveTo(sx-4,0);c.lineTo(sx+4,0);c.lineTo(sx+30+sw,SH-46);c.lineTo(sx-30+sw,SH-46);c.closePath();c.fill()});c.globalAlpha=1;
  RR(c,AR.bx+4,AR.by+42,34,4,'rgba(0,0,0,.28)');
  for(var k=0;k<looks.length;k++){var sp=charSprite(looks[k],Math.floor(tt*3+k)%2),ox=0,oy=Math.round(Math.sin(tt*3+k));RR(c,30+k*28-1,150,14,3,'rgba(0,0,0,.28)');if(AR.atk===k){ox=Math.round(AR.p*(AR.bx-34-(30+k*28)));oy=-Math.round(Math.sin(AR.p*Math.PI)*10)}c.drawImage(sp,30+k*28-1+ox,133+oy)}
  if(!AR.dead||AR.fade>0){var bob=Math.round(Math.sin(tt*2)*2),sx=AR.shake?Math.round((Math.random()-.5)*AR.shake):0;c.globalAlpha=AR.fade;c.drawImage(AR.flash>.5?sp3.white:sp3.boss,AR.bx-1+sx,AR.by-1+bob);c.globalAlpha=1}
}

// A damage number rising off the boss.
export function dmgNum(AR,fx,n,reduce){var el=document.createElement('div');el.className='dmg';el.textContent='-'+n;el.style.left=((AR.bx+20)/320*100)+'%';el.style.top=((AR.by+10)/180*100)+'%';fx.appendChild(el);if(reduce){setTimeout(function(){el.remove()},900);return}gsap.fromTo(el,{scale:.5,opacity:0},{scale:1.2,opacity:1,duration:.25,ease:'back.out(2)'});gsap.to(el,{y:-50,duration:1,ease:'power1.out'});gsap.to(el,{opacity:0,duration:.3,delay:.8,onComplete:function(){el.remove()}})}

// One lunge at the boss: run in, flash and shake on the hit, run back. onHit fires at the moment of impact.
export function hitBoss(AR,who,onHit,done,reduce){
  AR.atk=who;
  var tl=gsap.timeline({onComplete:function(){AR.atk=-1;if(done)done()}});
  if(reduce){onHit();tl.call(function(){});return}
  tl.to(AR,{p:1,duration:.32,ease:'power2.in'}).add(function(){AR.flash=1;AR.shake=8;onHit()}).to(AR,{flash:0,shake:0,duration:.25},'+=.05').to(AR,{p:0,duration:.3});
}
