#!/usr/bin/env python3
# OPの要所を撮る。音は headless で進まないことがあるので時刻を直接動かす。使い方: shot_op.py <出力先> <URL>
import sys, asyncio
from playwright.async_api import async_playwright
out, url = sys.argv[1], sys.argv[2]
TIMES=[3,12,20,24,40,47,50,66,79,101,115,119,137,150]
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'])
    pg = await b.new_page(viewport={'width':960,'height':540})
    logs=[]
    pg.on('console', lambda m: logs.append(m.type+': '+m.text) if m.type=='error' else None)
    pg.on('pageerror', lambda e: logs.append('PAGEERROR: '+str(e)))
    await pg.goto(url); await pg.wait_for_timeout(2500)
    await pg.screenshot(path=f'{out}/op-title.png')
    print('bgm paused', await pg.evaluate("__sd.music.el.paused"), 'btn', await pg.inner_text('#bgm'))
    await pg.click('#opbtn'); await pg.wait_for_timeout(1500)
    print('duration', await pg.evaluate("__sd.music.el.duration"), 'playing', await pg.evaluate("!__sd.music.el.paused"), 'ct', await pg.evaluate("__sd.music.el.currentTime"))
    for t in TIMES:
      await pg.evaluate(f"__sd.music.el.currentTime={t}"); await pg.wait_for_timeout(1400)
      await pg.screenshot(path=f'{out}/op-{t:03d}.png')
      print(t, await pg.evaluate("JSON.stringify({t:+__sd.op.t.toFixed(1),f:+__sd.op.f.toFixed(2),lyric:document.getElementById('oplyric').textContent})"), flush=True)
    await pg.click('#opclose'); await pg.wait_for_timeout(600)
    print('closed', await pg.evaluate("JSON.stringify({on:__sd.op.on,titleGone:document.getElementById('title').classList.contains('gone'),paused:__sd.music.el.paused,loop:__sd.music.el.loop})"))
    # 参加するとBGMが止まる
    await pg.fill('#name','確認'); await pg.click('#go'); await pg.wait_for_timeout(3000)
    print('joined', await pg.evaluate("JSON.stringify({j:__sd.S.joined,paused:__sd.music.el.paused})"))
    print('\n'.join(logs) or 'no errors')
    await b.close()
asyncio.run(main())
