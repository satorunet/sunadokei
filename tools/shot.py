#!/usr/bin/env python3
# 実ブラウザで一巡の要所を遊んでスクリーンショットを撮る。使い方: shot.py <出力先> <URL>
import sys, json, asyncio
from playwright.async_api import async_playwright
out, url = sys.argv[1], sys.argv[2]
ST="JSON.stringify({ph:__sd.S.phase,ep:__sd.S.epoch,left:+__sd.S.left.toFixed(1),f:+__sd.S.f.toFixed(2),alive:__sd.S.alive,total:__sd.S.total,life:+__sd.S.life.toFixed(1),ghost:__sd.S.ghost,x:+__sd.me.x.toFixed(1),y:+__sd.me.y.toFixed(1),z:+__sd.me.z.toFixed(1),g:__sd.grains.map.size})"
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg = await b.new_page(viewport={'width':1024,'height':576})
    logs=[]
    pg.on('console', lambda m: logs.append(m.type+': '+m.text) if m.type in('error','warning') else None)
    pg.on('pageerror', lambda e: logs.append('PAGEERROR: '+str(e)))
    await pg.goto(url); await pg.wait_for_timeout(3000)
    await pg.fill('#name','テスト'); await pg.click('#go')
    async def snap(n):
      await pg.screenshot(path=f'{out}/{n}.png'); print(n, await pg.evaluate(ST), flush=True)
    async def until(expr, ms=120000):
      await pg.wait_for_function(expr, timeout=ms, polling=200)
    # 自動操縦: 同じ球の一番近い粒へ走る。死にそうな上の球では中心へ
    await pg.wait_for_timeout(1500)
    await pg.evaluate("""()=>{const s=__sd;setInterval(()=>{const m=s.me;let b=null,bd=1e9;const top=m.y>=0;for(const g of s.grains.map.values()){if(g.top!==top)continue;const d=(g.x-m.x)**2+(g.z-m.z)**2;if(d<bd){bd=d;b=g;}}
      let tx=b?b.x:-m.x*5,tz=b?b.z:-m.z*5; if(window.__dive){tx=0;tz=0}
      s.view.yaw=Math.atan2(m.x-tx,m.z-tz); s.keys.add('KeyW');},150)}""")
    await pg.wait_for_timeout(1500); await snap('a-wait')
    await until('__sd.S.phase==1'); await pg.wait_for_timeout(9000); await snap('b-run-top')
    await pg.evaluate("window.__dive=true;__sd.view.pitch=.45")
    await until('__sd.me.y<-1',60000); await snap('c-falling')
    await pg.evaluate("window.__dive=false;__sd.view.pitch=.22")
    await pg.wait_for_timeout(5000); await snap('d-bottom')
    await until('__sd.S.phase==2&&__sd.timeLeft()<4.6')
    await snap('e-flip1')
    await until('__sd.S.phase==1')
    await until('__sd.S.phase==1'); await snap('g-after-flip')
    await pg.wait_for_timeout(2000); await snap('h-after-flip2')
    print('\n'.join(logs[:30]) or 'no console errors')
    await b.close()
asyncio.run(main())
