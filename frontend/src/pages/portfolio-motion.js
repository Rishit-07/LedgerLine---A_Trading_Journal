// Motion adapted from Marginalia Portfolio Template, Copyright (c) Kedhareswer Naidu (MIT).
import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import {ScrollToPlugin} from 'gsap/ScrollToPlugin';
import {MorphSVGPlugin} from 'gsap/MorphSVGPlugin';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, MorphSVGPlugin);

const closedInk = 'inset(-40% 100% -40% -6%)';
const openInk = 'inset(-40% -14% -40% -6%)';

export function bindPortfolioMotion(page, sheets) {
  const cover = sheets[0];
  const media = gsap.matchMedia(page);
  const currentSheet = page.querySelector('.mgn-bar-sec');
  const progress = page.querySelector('.mgn-progress');
  const observer = new ResizeObserver(() => ScrollTrigger.refresh());
  observer.observe(page);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let scroll;

  function jump(target) {
    scroll?.kill();
    target.tabIndex = -1;
    target.focus({preventScroll:true});
    const y = target === cover ? 0 : target.getBoundingClientRect().top + window.scrollY;
    if (reduced.matches) window.scrollTo({top:y,behavior:'instant'});
    else {
      scroll = gsap.to(window, {
        scrollTo:{y,autoKill:true},duration:target === cover ? 1.6 : 1.3,ease:'power3.inOut',
        onComplete:() => window.scrollTo({top:y,behavior:'instant'}),
      });
    }
  }
  page.addEventListener('portfolio-jump', event => jump(event.target));
  cover.querySelector('.mgn-hint').onclick = () => jump(sheets[1]);
  page.querySelector('.mgn-foot button').onclick = () => jump(cover);

  media.add({motion:'(prefers-reduced-motion: no-preference)', still:'(prefers-reduced-motion: reduce)'}, ({conditions}) => {
    for (const sheet of sheets) {
      ScrollTrigger.create({
        trigger:sheet,start:'top 40%',end:'bottom 40%',
        onToggle:({isActive}) => { if (isActive) currentSheet.textContent = sheet.dataset.label.toLowerCase(); },
      });
    }
    gsap.to(progress,{scaleX:1,ease:'none',scrollTrigger:{trigger:page,start:'top top',end:'bottom bottom',scrub:true}});
    if (!conditions.motion) return;

    const intro = gsap.timeline({delay:.15});
    intro.from(cover.querySelectorAll('.mgn-li'),{yPercent:118,rotate:8,duration:1.2,ease:'expo.out',stagger:.055},0)
      .fromTo(cover.querySelector('.mgn-write'),{clipPath:closedInk},{clipPath:openInk,duration:1.2,ease:'power1.inOut'},.6)
      .from(cover.querySelectorAll('.mgn-draw'),{strokeDashoffset:1,duration:.9,ease:'power2.inOut',stagger:.08},1)
      .from(cover.querySelectorAll('.mgn-cover-meta > *'),{y:18,autoAlpha:0,duration:.8,stagger:.08,ease:'power3.out'},1.1)
      .from(cover.querySelector('.mgn-star-s'),{scale:0,rotation:-180,svgOrigin:'0 0',duration:.8,ease:'back.out(3)'},1.5);
    const pill = cover.querySelector('.mgn-pill');
    if (pill) intro.from(pill,{scale:.5,autoAlpha:0,duration:.9,ease:'back.out(2.2)'},.75);

    const letters = cover.querySelectorAll('.mgn-l');
    const departure = gsap.timeline({scrollTrigger:{trigger:cover,start:'top top',end:'bottom top',scrub:.6}});
    letters.forEach((letter,index) => departure.to(letter,{
      x:(index-(letters.length-1)/2)*26, y:-70-(index*71%170), rotation:(index*19%36)-18, ease:'none',
    },0));
    departure.to(cover.querySelectorAll('.mgn-pill-wrap,.mgn-sig'),{y:-110,autoAlpha:0,ease:'none'},0)
      .to(cover.querySelector('.mgn-cover-in'),{scale:.9,ease:'none'},0);

    const star = cover.querySelector('.mgn-star-g');
    const phase = {angle:.15};
    const tilt = -Math.PI/10;
    const orbit = gsap.to(phase,{angle:1.15,duration:7,repeat:-1,ease:'none',onUpdate:() => {
      const angle = phase.angle*2*Math.PI;
      const x = 92*Math.cos(angle), y = 30*Math.sin(angle);
      star?.setAttribute('transform','translate('+(x*Math.cos(tilt)-y*Math.sin(tilt))+' '+(x*Math.sin(tilt)+y*Math.cos(tilt))+')');
      if (star) star.style.opacity = y < 0 ? '.3' : '1';
    }});
    ScrollTrigger.create({trigger:cover,start:'top bottom',end:'bottom top',onToggle:({isActive}) => orbit.paused(!isActive)});

    for (const title of page.querySelectorAll('.mgn-hd')) {
      gsap.from(title.querySelectorAll('.mgn-ci'),{
        yPercent:118,rotate:6,duration:1.05,ease:'expo.out',stagger:.035,
        scrollTrigger:{trigger:title,start:'top 88%',once:true},
      });
      const line = title.querySelector('.mgn-uline path');
      const smooth = line.getAttribute('d');
      gsap.set(line,{attr:{d:line.dataset.rough}});
      gsap.timeline({scrollTrigger:{trigger:title,start:'top 90%',end:'top 30%',scrub:.8}})
        .from(line,{strokeDashoffset:1,duration:.45,ease:'none'},0)
        .to(line,{morphSVG:smooth,duration:1,ease:'none'},0);
    }
    for (const annotation of page.querySelectorAll('[data-ink]')) {
      const strokes = annotation.querySelectorAll('.mgn-draw');
      const writing = annotation.querySelectorAll('.mgn-write');
      const reveal = gsap.timeline({scrollTrigger:{trigger:annotation,start:'top 84%',once:true}});
      if (strokes.length) reveal.from(strokes,{strokeDashoffset:1,duration:.8,stagger:.1,ease:'power2.inOut'},0);
      if (writing.length) reveal.fromTo(writing,{clipPath:closedInk},{clipPath:openInk,duration:.95,stagger:.16},0);
    }
    for (const block of page.querySelectorAll('[data-rise]')) {
      gsap.from(block,{autoAlpha:0,y:36,duration:.9,ease:'power3.out',scrollTrigger:{trigger:block,start:'top 92%',once:true}});
    }
    for (const count of page.querySelectorAll('.mgn-count')) {
      const value = Number(count.dataset.value);
      const state = {number:0};
      gsap.fromTo(state,{number:0},{
        number:value,duration:1.8,ease:'power3.out',
        scrollTrigger:{trigger:count,start:'top 90%',once:true},
        onUpdate:() => { count.textContent = String(Math.round(state.number)); },
      });
    }
    for (const background of page.querySelectorAll('.mgn-sheet-bg')) {
      if (background.parentElement.previousElementSibling?.dataset.tone === 'night') continue;
      gsap.fromTo(background,{clipPath:'inset(80px 4% 0 4% round 56px)'},{
        clipPath:'inset(0px 0% 0 0% round 0px)',ease:'none',
        scrollTrigger:{trigger:background.parentElement,start:'top bottom',end:'top 8%',scrub:.5},
      });
    }
    for (const group of page.querySelectorAll('.mgn-setup-phones')) {
      const section = group.closest('.mgn-sheet');
      const entrance = {trigger:section,start:'top 85%',end:'top 15%',scrub:.8};
      const front = group.querySelector('[data-slot="0"]');
      gsap.from(front,{rotationY:-40,rotationX:12,scale:.86,y:28,ease:'power2.out',scrollTrigger:entrance});
      const sides = group.querySelectorAll('.mgn-phone-slot:not([data-slot="0"])');
      sides.forEach((phone,index) => gsap.from(phone,{
        xPercent:index ? -55 : 55,rotation:index ? -10 : 10,y:45,ease:'power3.out',scrollTrigger:{...entrance},
      }));
      group.onpointermove = event => {
        if (event.pointerType === 'touch') return;
        const bounds = group.getBoundingClientRect();
        gsap.to(group,{rotationY:((event.clientX-bounds.left)/bounds.width-.5)*12,
          rotationX:((event.clientY-bounds.top)/bounds.height-.5)*-8,duration:.45,overwrite:true});
      };
      group.onpointerleave = () => gsap.to(group,{rotationX:0,rotationY:0,duration:.6,overwrite:true});
    }
    const playbook = page.querySelector('.mgn-deal');
    if (playbook) {
      media.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
        const row = playbook.querySelector('.mgn-row');
        const cards = [...row.children];
        if (cards.length < 2) return;
        const deal = gsap.timeline({scrollTrigger:{
          trigger:playbook,start:'top top',end:'bottom bottom',scrub:.7,invalidateOnRefresh:true,
        }});
        cards.forEach((card,index) => {
          deal.fromTo(card,{
            x:() => (row.clientWidth-card.offsetWidth)/2-card.offsetLeft + index*4,
            y:() => (row.clientHeight-card.offsetHeight)/2-card.offsetTop - index*5,
            rotation:(index%2 ? 1 : -1)*(12-index),scale:.9,
          },{x:0,y:0,rotation:0,scale:1,duration:1,ease:'power2.inOut'},.18+(cards.length-1-index)*.14);
        });
      });
    }
    const stopPointer = bindPointerMotion(cover,page);
    return () => {
      stopPointer();
      for (const group of page.querySelectorAll('.mgn-setup-phones')) {
        group.onpointermove = group.onpointerleave = null;
        gsap.killTweensOf(group);
        group.style.removeProperty('transform');
      }
      for (const count of page.querySelectorAll('.mgn-count')) count.textContent = count.dataset.value;
    };
  });

  addEventListener('pagehide',event => {
    if (event.persisted) return;
    observer.disconnect();
    scroll?.kill();
    media.revert();
  });
}

function bindPointerMotion(cover, page) {
  const unsubscribe = new AbortController();
  const {signal} = unsubscribe;
  const canvas = cover.querySelector('canvas');
  const brush = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1,2);
  const pen = getComputedStyle(cover).getPropertyValue('--mgn-pen').trim();
  const points = [];
  const lifetime = 950;
  let frame;
  const resize = new ResizeObserver(() => {
    canvas.width = Math.round(cover.clientWidth*dpr);
    canvas.height = Math.round(cover.clientHeight*dpr);
  });
  resize.observe(cover);

  function paintTrail(now) {
    frame = undefined;
    while (points.length && now-points[0].time > lifetime) points.shift();
    brush.clearRect(0,0,canvas.width,canvas.height);
    brush.lineCap = 'round';
    brush.strokeStyle = pen;
    for (let index=1;index<points.length;index++) {
      const current = points[index], previous = points[index-1];
      if (current.gap) continue;
      const life = 1-(now-current.time)/lifetime;
      brush.globalAlpha = life*.9;
      brush.lineWidth = (.5+life*2.1)*dpr;
      brush.beginPath();
      brush.moveTo(previous.x*dpr,previous.y*dpr);
      brush.lineTo(current.x*dpr,current.y*dpr);
      brush.stroke();
    }
    if (points.length) frame = requestAnimationFrame(paintTrail);
  }
  cover.addEventListener('pointermove',event => {
    if (!brush || event.pointerType === 'touch') return;
    const bounds = cover.getBoundingClientRect();
    const time = performance.now();
    points.push({x:event.clientX-bounds.left,y:event.clientY-bounds.top,time,gap:time-(points.at(-1)?.time ?? -Infinity)>90});
    frame ??= requestAnimationFrame(paintTrail);
  },{signal,passive:true});
  const shape = cover.querySelector('.mgn-star-path');
  const signature = cover.querySelector('.mgn-sig');
  const sparkle = shape?.getAttribute('d');
  const heart = 'M0 11C-20-2-12-15 0-7C12-15 20-2 0 11Z';
  if (shape) {
    signature.addEventListener('pointerenter',() => gsap.to(shape,{morphSVG:heart,duration:.6,ease:'back.out(2)',overwrite:true}),{signal});
    signature.addEventListener('pointerleave',() => gsap.to(shape,{morphSVG:sparkle,duration:.6,ease:'back.out(2)',overwrite:true}),{signal});
  }
  const portrait = page.querySelector('.mgn-traits');
  if (portrait) {
    const picture = portrait.querySelector('.mgn-portrait');
    const notes = portrait.querySelector('.mgn-portrait-notes');
    portrait.addEventListener('pointermove',event => {
      if (event.pointerType === 'touch') return;
      const bounds = portrait.getBoundingClientRect();
      const x = (event.clientX-bounds.left)/bounds.width-.5;
      const y = (event.clientY-bounds.top)/bounds.height-.5;
      gsap.to(picture,{x:-x*8,y:-y*6,duration:.8,ease:'power3.out',overwrite:true});
      gsap.to(notes,{x:x*18,y:y*14,duration:.8,ease:'power3.out',overwrite:true});
    },{signal,passive:true});
    portrait.addEventListener('pointerleave',() => gsap.to([picture,notes],{x:0,y:0,duration:1,overwrite:true}),{signal});
  }
  return () => {
    unsubscribe.abort();
    resize.disconnect();
    cancelAnimationFrame(frame);
    brush?.clearRect(0,0,canvas.width,canvas.height);
  };
}
