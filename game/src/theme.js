'use strict';
// Menu / panel look in the language of the concept sheets: charcoal ash-stone panels in a rough forged frame,
// bone-white Cinzel titles over an ember-crossed rule, IM Fell text, ash-grey secondary text, ember for focus.
// No browns. Art from bake/ui_paint.py (ui_panel, ui_frame, ui_btn, ui_rule, cellbg); fonts in assets/ (OFL).
function initTheme() {
  if (UI._themed) return; UI._themed = true;
  const A = ASSET_BASE, css = document.createElement('style');
  css.textContent = `
@font-face{font-family:"Cinzel";src:url(${A}cinzel.woff) format("woff");font-weight:400 900;font-display:swap}
@font-face{font-family:"IM Fell English";src:url(${A}fell.woff) format("woff");font-style:normal;font-display:swap}
@font-face{font-family:"IM Fell English";src:url(${A}fell_it.woff) format("woff");font-style:italic;font-display:swap}
:root{
  --serif:"IM Fell English","EB Garamond",Palatino,Georgia,serif;--display:"Cinzel","Trajan Pro",Palatino,Georgia,serif;
  --bone:#dcd3c3;--bone-hi:#f2eadb;--ash:#8f8a82;--ash-dim:#5c5954;--ember:#d8743a;--ember-hi:#f2a465;--blood:#8c1c12;
  --text:#d4ccbd;--muted:#8f8a82;--line:#2e2d2c;
}
body{color:var(--text)}
/* loading + title */
#loading{background:radial-gradient(ellipse at 50% 40%,#141415,#000 70%)}
.ltitle,.title .tt{font-family:var(--display);font-weight:600;font-variant:normal;text-transform:uppercase;color:var(--bone);letter-spacing:.24em;
  text-shadow:0 0 2px #000,0 3px 0 #000,0 0 34px rgba(150,40,15,.45),0 0 80px rgba(0,0,0,.9)}
.title .tt{font-size:min(9.6vw,100px)}
.lsub,.title .ts{font-family:var(--serif);font-style:italic;color:var(--ash);letter-spacing:.42em;text-transform:none}
.title .ts::after{content:'';display:block;width:min(560px,70vw);height:22px;margin:10px auto 0;background:url(${A}ui_rule.webp) center/100% 100% no-repeat;opacity:.9}
.lbar{border-color:#333;background:#080808}
#lfill{background:linear-gradient(90deg,#5a1206,#d8743a);box-shadow:0 0 10px #c05a20}
/* panels */
.panel{background:url(${A}ui_panel.webp) 0 0/512px repeat,#0f0f10;border:0;border-style:solid;border-width:30px;
  border-image:url(${A}ui_frame.webp) 30 / 30px round;padding:4px 10px 6px;color:var(--text);
  box-shadow:0 18px 60px rgba(0,0,0,.92),0 0 0 1px rgba(0,0,0,.6),inset 0 0 60px rgba(0,0,0,.75)}
.panel::before,.panel::after{content:none}
.pclose{top:2px;right:4px;color:var(--ash)}
.pclose:hover{color:var(--bone-hi);background:rgba(255,255,255,.06)}
.ptitle{font-family:var(--display);font-weight:600;font-variant:normal;text-transform:uppercase;letter-spacing:.2em;font-size:21px;color:var(--bone);text-shadow:0 2px 0 #000,0 0 14px rgba(0,0,0,.9)}
.ptitle::after{content:'';display:block;width:min(300px,86%);height:18px;margin:2px auto 0;background:url(${A}ui_rule.webp) center/100% 100% no-repeat}
.ptitle:empty{display:none}
.ptitle.small{font-size:16px}
.psub{color:var(--ash);font-style:italic;font-size:15px;margin:0 0 10px}
.phelp{color:var(--ash);font-size:14px}
.ptabs{grid-column:1/-1;display:flex;justify-content:center;align-items:center;gap:6px;margin:-2px 0 6px;font:600 13px var(--display);letter-spacing:.22em;text-transform:uppercase}
.ptab{color:var(--ash-dim);padding:3px 12px 5px;cursor:pointer;border-bottom:2px solid transparent}
.ptab:hover{color:var(--ash)}
.ptab.on{color:var(--bone-hi);border-bottom-color:var(--ember);text-shadow:0 0 10px rgba(216,116,58,.45);cursor:default}
.ptab-g .gl{transform:scale(.9)}
.fi.focused{outline:1px solid var(--ember);outline-offset:1px;box-shadow:0 0 0 1px #000,0 0 14px rgba(216,116,58,.5),inset 0 0 16px rgba(216,116,58,.16)}
/* hero sheet */
.xpline{color:var(--ash)} .xpline b{color:var(--bone)}
.attrs{border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.alabel{font-family:var(--display);font-variant:normal;text-transform:uppercase;letter-spacing:.14em;font-size:14px;color:var(--bone)}
.aval{color:var(--bone-hi)}
.plus{background:linear-gradient(#2a2a2c,#121213);border:1px solid #4a4744;color:var(--ember-hi);border-radius:2px;box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
.ptsleft{color:var(--ember-hi)}
.srow{border-bottom:1px solid #1c1c1c}
.srow span{color:var(--ash)} .srow b{color:var(--bone)}
.pbtn,.dopt,.mopt,.mslider{background:url(${A}ui_btn.webp) center/cover,#111;border:1px solid #2a2928;color:var(--bone);box-shadow:inset 0 0 12px rgba(0,0,0,.7)}
.pbtn{font-family:var(--display);font-variant:normal;text-transform:uppercase;letter-spacing:.18em;font-size:14px}
.dopt.focused,.mopt.focused,.pbtn.focused,.mslider.focused{border-left:3px solid var(--ember);color:var(--bone-hi)}
.mopt.disabled{color:var(--ash-dim)}
.mslider .sv{color:var(--ember)}
.badge{background:var(--blood);color:var(--bone-hi);box-shadow:0 0 6px rgba(160,30,10,.6)}
.equip{background:radial-gradient(ellipse at center,rgba(70,70,74,.18),rgba(0,0,0,0) 70%)}
.cell{background:#09090a url(${A}cellbg.webp) center/cover;border:1px solid #232223;box-shadow:inset 0 0 12px #000,0 1px 0 rgba(255,255,255,.03)}
.cell.magic{background:radial-gradient(circle,rgba(50,70,170,.32),transparent 70%),#09090a url(${A}cellbg.webp) center/cover}
.cell.unique{background:radial-gradient(circle,rgba(190,140,50,.34),transparent 70%),#09090a url(${A}cellbg.webp) center/cover;border-color:#5a4a26}
.cell.cant{background:radial-gradient(circle,rgba(150,20,10,.42),#09090a 70%)}
.slabel{font-family:var(--display);font-variant:normal;text-transform:uppercase;letter-spacing:.12em;font-size:9px;color:#3e3c3a}
.goldline{color:#d9b65a}
/* tooltips */
.tooltip{background:url(${A}ui_panel.webp) 0 0/512px,#0c0c0d;border:1px solid #3a3836;box-shadow:0 0 0 1px #000,0 10px 30px rgba(0,0,0,.95),inset 0 0 30px rgba(0,0,0,.6);font-family:var(--serif)}
.tiphint,.eqhdr{border-color:#2a2928;color:var(--ash)}
/* skills */
.aslot{background:#09090a url(${A}cellbg.webp) center/cover;border:1px solid #2f2e2d}
.aslot.assigning{outline:2px dashed var(--ember)}
.skrow{border:1px solid #232222;background:rgba(0,0,0,.32)}
.skname{font-family:var(--display);font-variant:normal;text-transform:uppercase;letter-spacing:.14em;font-size:15px;color:var(--bone)}
.rank{color:var(--ember-hi);font-family:var(--serif);text-transform:none;letter-spacing:0}
.skdesc{color:#bdb5a8} .skreq{color:var(--ash)}
/* dialogue */
.dialog .ptitle{font-size:19px}
.dtext{font-family:var(--serif);font-size:18px;color:var(--bone)} .dtext i{color:var(--ash)}
/* map tab */
.mappanel{left:50%;top:14px;transform:translateX(-50%);padding:2px 10px 4px;background:rgba(10,10,11,.86)}
.mappanel .pclose{display:none}
.mapkey{display:flex;gap:16px;justify-content:center;font-size:14px;color:var(--ash);margin:2px 0}
.mapkey i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:0}
/* in-world text */
.zoneTitle .zt{font-family:var(--display);font-weight:600;font-variant:normal;text-transform:uppercase;letter-spacing:.24em;color:var(--bone);text-shadow:0 0 20px #000,0 0 40px #000,0 2px 0 #000,0 0 30px rgba(150,40,15,.35)}
.zoneTitle .zs{color:var(--ash)}
.zoneTitle .zs::after{content:'';display:block;width:min(420px,60vw);height:18px;margin:6px auto 0;background:url(${A}ui_rule.webp) center/100% 100% no-repeat}
.msg{color:var(--bone)} .prompt{color:var(--bone-hi);font-family:var(--serif)}
.glabel{background:rgba(8,8,9,.82);border:1px solid #333130}
.glabel.focus{border-color:var(--ember);box-shadow:0 0 8px rgba(216,116,58,.45)}
.hint{color:var(--ash)}
.tbtn{filter:saturate(.15) brightness(1.05);color:var(--bone)!important}
.tbtn:hover{filter:saturate(.3) brightness(1.25)}
.buff{filter:saturate(.3);color:var(--bone)}
.death .dt{font-family:var(--display);font-variant:normal;text-transform:uppercase;letter-spacing:.24em}
.death .ds{color:var(--ash)} .death .dp{color:var(--bone)}
.menu.titlemenu{background:url(${A}ui_panel.webp) 0 0/512px repeat,rgba(10,10,11,.9)}
.credits{color:#b8b1a5}
`;
  document.head.appendChild(css);
}
