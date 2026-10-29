/* eslint-disable */
// @ts-nocheck
/* The pixel-art studio lot from the Studio Lot design: the sky, the seven buildings, the lit path to the next
   step and the people walking by. The drawing code is the design's own, wrapped so it can start and stop with the page. */
import gsap from "gsap";

export var BLD=[
 {id:'today',name:"Writers' Room",plain:'Today',x:26,w:52,h:78,col:'#ff8f6b',roof:'#c64a2c'},
 {id:'record',name:'Soundstage',plain:'Record',x:82,w:70,h:92,col:'#6a82e8',roof:'#3a4fb5'},
 {id:'edit',name:'Cutting Room',plain:'Edit',x:156,w:48,h:66,col:'#3fd1bb',roof:'#1f8f80'},
 {id:'post',name:'Marquee Theater',plain:'Post',x:208,w:58,h:84,col:'#e0577a',roof:'#a02c4d'},
 {id:'library',name:'Archive',plain:'Library',x:270,w:46,h:64,col:'#9be37a',roof:'#5aa83a'},
 {id:'signals',name:'Signal Tower',plain:'Signals',x:320,w:36,h:118,col:'#c9c2f0',roof:'#7a70c0'},
 {id:'team',name:'Prize Arcade',plain:'Team',x:360,w:52,h:70,col:'#ffc933',roof:'#c8941a'}
];

export function createLot(canvas, opts) {
  var root = document.documentElement, mq = window.matchMedia("(prefers-color-scheme: dark)");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var D = function (x) { return reduce ? 0 : x };
  function isDark() { var t = root.getAttribute("data-theme"); return t ? t === "dark" : mq.matches }

function hexc(h){if(h.charAt(0)==='r')return h.match(/\d+/g).slice(0,3).map(Number);return [1,3,5].map(function(i){return parseInt(h.substr(i,2),16)})}
function mix(a,b,t){var A=hexc(a),B=hexc(b);return 'rgb('+A.map(function(v,i){return Math.round(v+(B[i]-v)*t)}).join(',')+')'}
var T={tod:isDark()?1:0};function M(d,n){return mix(d,n,T.tod)}
var obs=new MutationObserver(function(){gsap.to(T,{tod:isDark()?1:0,duration:D(.8)})});obs.observe(root,{attributes:true,attributeFilter:['data-theme']});
function bake(w,h,fn){var c=document.createElement('canvas');c.width=w+2;c.height=h+2;var x=c.getContext('2d');x.translate(1,1);fn(x);x.setTransform(1,0,0,1,0,0);var d=x.getImageData(0,0,c.width,c.height),a=d.data,src=new Uint8ClampedArray(a),W=c.width,H=c.height;
  for(var y=0;y<H;y++)for(var px=0;px<W;px++){var i=(y*W+px)*4;if(src[i+3]!==0)continue;var n=(px>0&&src[i-1]>0)||(px<W-1&&src[i+7]>0)||(y>0&&src[i-W*4+3]>0)||(y<H-1&&src[i+W*4+3]>0);if(n){a[i]=13;a[i+1]=11;a[i+2]=43;a[i+3]=255}}
  x.putImageData(d,0,0);return c}
function whiten(c){var n=document.createElement('canvas');n.width=c.width;n.height=c.height;var x=n.getContext('2d');x.drawImage(c,0,0);x.globalCompositeOperation='source-in';x.fillStyle='#fff';x.fillRect(0,0,n.width,n.height);return n}
var spr={};
function charSprite(l,f){var k=JSON.stringify(l)+f;if(spr[k])return spr[k];var s=bake(12,17,function(x){var R=function(a,b,w,h,c){x.fillStyle=c;x.fillRect(a,b,w,h)},ink='#161433';R(3,2,6,6,l.skin);if(l.style==='cap'){R(2,1,8,3,l.prop);R(8,3,3,1,l.prop)}else if(l.style==='bun'){R(3,1,6,3,l.hair);R(2,3,1,4,l.hair);R(9,3,1,4,l.hair);R(5,-1,3,2,l.hair)}else{R(3,1,6,3,l.hair);R(2,2,1,4,l.hair);R(9,2,1,4,l.hair)}R(4,5,1,1,ink);R(7,5,1,1,ink);R(2,8,8,5,l.shirt);R(1,8,1,4,l.shirt);R(10,8,1,4,l.shirt);R(1,12,1,1,l.skin);R(10,12,1,1,l.skin);var lo=f?1:0;R(3,13,3,2+lo,l.pants);R(6,13,3,3-lo,l.pants);R(3,15+lo,3,1,ink);R(6,16-lo,3,1,ink)});spr[k]=s;return s}
var CREW=[{n:'',look:{hair:'#3b2a20',style:'flat',skin:'#f2c9a0',shirt:'#ff8f6b',pants:'#2b3a67',prop:'#ffd45a'},dmg:0,turn:0},{n:'',look:{hair:'#161433',style:'cap',skin:'#c68e5f',shirt:'#3b7bff',pants:'#2a2a3a',prop:'#ff7a5c'},dmg:1010,turn:320},{n:'',look:{hair:'#2b2b2b',style:'bun',skin:'#8d5a3b',shirt:'#3fd1bb',pants:'#3a3a55',prop:'#ffc933'},dmg:990,turn:290},{n:'',look:{hair:'#d9602b',style:'flat',skin:'#f2c9a0',shirt:'#9be37a',pants:'#33405e',prop:'#ffc933'},dmg:850,turn:260}];
function RR(c,x,y,w,h,col){c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),w,h)}
function rng(seed){var a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

var H={view:null},HC=canvas.getContext('2d'),LW=448,LH=216,GY=172,hot=-1,farSky=[],stars=[],winLit={};
HC.imageSmoothingEnabled=false;
(function(){var r=rng(7);for(var x=0;x<LW;x+=14)farSky.push({x:x,w:12+Math.floor(r()*8),h:24+Math.floor(r()*40),k:r()<.5});var r2=rng(11);for(var i=0;i<60;i++)stars.push({x:Math.floor(r2()*LW),y:Math.floor(r2()*90),p:r2()*6});var r3=rng(5);for(var j=0;j<400;j++)winLit[j]=r3()<.7})();
function pcircle(c,cx,cy,r,col){for(var dy=-r;dy<=r;dy++){var w=Math.floor(Math.sqrt(r*r-dy*dy));RR(c,cx-w,cy+dy,w*2+1,1,col)}}
var walkers=[{x:60,v:.18,l:CREW[1].look},{x:250,v:-.14,l:CREW[2].look},{x:380,v:.1,l:CREW[3].look}];
function targetId(){return opts.targetId()}
function nextIdx(){return BLD.map(function(b){return b.id}).indexOf(targetId())}
function drawHome(time){
  var c=HC,t=T.tod,tt=reduce?0:time,ni=nextIdx();
  for(var i=0;i<30;i++)RR(c,0,i*6,LW,6,mix(M('#55b8ff','#0b0a2e'),M('#d8f1ff','#2a2670'),i/29));
  if(t>.05)stars.forEach(function(s){var a=t*(.5+.5*Math.sin(tt*2+s.p));if(a>.25)RR(c,s.x,s.y,1,1,'#f3f0ff')});
  pcircle(c,384,34+t*130,12,'#ffe27a');pcircle(c,384,34+(1-t)*130,10,'#f3f0ff');pcircle(c,388,31+(1-t)*130,8,M('#d8f1ff','#2a2670'));
  if(t<.95)for(var k=0;k<3;k++){var cx=((tt*6+k*170)%(LW+80))-40,cy=26+k*20,cc=mix('#ffffff','#2a2670',t);RR(c,cx,cy,34,6,cc);RR(c,cx+6,cy-4,20,4,cc);RR(c,cx+10,cy+6,22,3,cc)}
  farSky.forEach(function(b){RR(c,b.x,GY-b.h-10,b.w,b.h+10,M(b.k?'#9ac3e0':'#7fb0d4','#1a1850'))});
  RR(c,0,GY,LW,LH-GY,M('#b9c4d6','#1b1a45'));RR(c,0,GY,LW,2,M('#98a4bd','#2a2870'));RR(c,0,GY+22,LW,22,M('#8d98b0','#12102f'));
  for(var s=0;s<LW;s+=24)RR(c,s+4,GY+32,12,2,M('#ffffff','#7a74c9'));
  if(ni>=0){var tx=BLD[ni].x+BLD[ni].w/2;for(var px=30;px<tx;px+=12)RR(c,px+((tt*20)%12),GY+5,5,2,'#ffc933')}
  BLD.forEach(function(b,i){
    var y=GY-b.h+(hot===i?-2:0),wall=mix(b.col,'#0d0b33',t*.55),roof=mix(b.roof,'#0d0b33',t*.5),dark=mix(b.col,'#0d0b33',.25+t*.4);
    RR(c,b.x+4,GY,b.w,3,'rgba(0,0,0,.18)');RR(c,b.x,y,b.w,b.h,wall);RR(c,b.x+b.w-7,y,7,b.h,dark);RR(c,b.x,y,2,b.h,mix(wall,'#ffffff',.18));RR(c,b.x-2,y-4,b.w+4,4,roof);
    var cols=Math.max(2,Math.floor((b.w-10)/9)),rows=Math.max(2,Math.floor((b.h-34)/12));
    for(var ry=0;ry<rows;ry++)for(var cx2=0;cx2<cols;cx2++){var wi=(i*53+ry*7+cx2*3)%400;RR(c,b.x+6+cx2*9,y+14+ry*12,5,7,winLit[wi]?mix(mix('#7fb4e6','#ffe27a',.2),'#ffd45a',t):mix('#7fb4e6','#2b2a6e',t))}
    RR(c,b.x+b.w/2-4,GY-14,8,14,mix('#161433','#0d0b33',t));RR(c,b.x+4,y+4,b.w-8,6,mix('#ffffff','#e8e3ff',t));
    if(b.id==='today'){RR(c,b.x+8,y-14,6,10,roof);for(var p=0;p<3;p++)RR(c,b.x+9+((tt*8+p*5)%6),y-18-((tt*10+p*9)%16),3,3,mix('#ffffff','#9a96d8',t))}
    if(b.id==='record'){RR(c,b.x+6,y-8,b.w-12,4,roof);RR(c,b.x+14,y-12,b.w-28,4,roof);RR(c,b.x+b.w-16,y+16,10,5,Math.sin(tt*4)>0?'#ff3b30':'#6b1a18')}
    if(b.id==='edit'){pcircle(c,b.x+b.w/2,y-11,7,'#2b2b3a');pcircle(c,b.x+b.w/2,y-11,2,'#fff');for(var f=0;f<6;f++)RR(c,b.x+3+f*7,GY-26,4,5,f%2?'#161433':'#ffffff')}
    if(b.id==='post'){for(var m=0;m<12;m++){var on=((m+Math.floor(tt*6))%3)===0;RR(c,b.x+5+m*4,y+3,2,2,on?'#ffe27a':mix('#fff6c9','#5a3a40',.4))}}
    if(b.id==='library'){pcircle(c,b.x+b.w/2,y-2,8,roof);RR(c,b.x+b.w/2-8,y-2,17,3,roof)}
    if(b.id==='signals'){RR(c,b.x+17,y-26,2,24,'#161433');RR(c,b.x+16,y-28,4,3,Math.sin(tt*5)>0?'#ff3b30':'#6b1a18');for(var rg=0;rg<2;rg++){var rr=((tt*14+rg*14)%28);c.strokeStyle='rgba(255,201,51,'+(1-rr/28)*.8+')';c.lineWidth=1;c.beginPath();c.arc(b.x+18,y-27,rr,Math.PI*1.1,Math.PI*1.9);c.stroke()}}
    if(b.id==='team'){var fl=Math.sin(tt*9)>-.3;RR(c,b.x+8,y+14,b.w-16,6,fl?'#ff5a3c':'#7a2a1c');RR(c,b.x+8,y+24,b.w-16,4,fl?'#3fd1bb':'#1f5f58')}
    if(i===ni){c.strokeStyle='rgba(255,201,51,'+(.55+.45*Math.sin(tt*5))+')';c.lineWidth=2;c.strokeRect(b.x-3,y-6,b.w+6,b.h+8);var ay=Math.round(Math.sin(tt*5)*2),ax=b.x+b.w/2;RR(c,ax-4,y-22+ay,9,2,'#ffc933');RR(c,ax-3,y-20+ay,7,2,'#ffc933');RR(c,ax-2,y-18+ay,5,2,'#ffc933');RR(c,ax-1,y-16+ay,3,2,'#ffc933')}
  });
  if(hot>=0){var hb=BLD[hot];c.strokeStyle='#ffffff';c.lineWidth=1;c.strokeRect(hb.x-2.5,GY-hb.h-6.5,hb.w+5,hb.h+7)}
  [14,150,268,358,438].forEach(function(x){RR(c,x,GY-28,1,28,'#161433');RR(c,x-2,GY-30,5,2,'#161433');if(t>.2){c.globalAlpha=.45*t;RR(c,x-6,GY-30,13,2,'#ffe27a');RR(c,x-9,GY-28,19,3,'#ffe27a');RR(c,x-12,GY-25,25,8,'#ffe27a');c.globalAlpha=1}});
  walkers.forEach(function(w,i){w.x+=reduce?0:w.v;if(w.x>LW+10)w.x=-14;if(w.x<-14)w.x=LW+10;var sp=charSprite(w.l,Math.floor(tt*4+i)%2);c.save();if(w.v<0){c.translate(Math.round(w.x)+sp.width,0);c.scale(-1,1);c.drawImage(sp,0,GY+4)}else c.drawImage(sp,Math.round(w.x),GY+4);c.restore()});
}

  var homeTick = function (t) { drawHome(t) };
  gsap.ticker.add(homeTick);
  return {
    setHot: function (i) { hot = i },
    destroy: function () { gsap.ticker.remove(homeTick); obs.disconnect() },
  };
}
