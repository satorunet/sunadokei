#!/usr/bin/env python3
# 結果発表のイイネを2人で連打して確認する。使い方: shot_like.py <出力先> <URL>
import sys, asyncio
from playwright.async_api import async_playwright
out, url = sys.argv[1], sys.argv[2]
CNT="JSON.stringify({r:document.getElementById('likeRound').textContent,m:document.getElementById('likeMine').textContent,a:document.getElementById('likeTotal').textContent})"
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    logs=[]
    async def mk(name, **kw):
      c = await b.new_context(**kw); pg = await c.new_page()
      pg.on('console', lambda m: logs.append(m.text) if m.type=='error' else None); pg.on('pageerror', lambda e: logs.append('PE '+str(e)))
      await pg.goto(url); await pg.fill('#name',name); await pg.click('#go')
      return pg
    a = await mk('甲', viewport={'width':960,'height':540})
    c = await mk('乙', viewport={'width':390,'height':844}, has_touch=True, is_mobile=True)
    # 結果前は送っても増えない
    await a.wait_for_function('__sd.S.joined', timeout=30000)
    await a.wait_for_function("document.getElementById('result').classList.contains('on')", timeout=120000)
    await c.wait_for_function("document.getElementById('result').classList.contains('on')", timeout=30000)
    print('start', await a.evaluate(CNT))
    # 甲: 上限(1通50)を超える速さで連打 → 取りこぼさない
    await a.evaluate("for(let i=0;i<130;i++)document.getElementById('like').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}))")
    print('甲 直後', await a.evaluate(CNT))
    await c.tap('#like'); await c.tap('#like'); await c.tap('#like')
    await a.wait_for_timeout(1500)
    await a.screenshot(path=f'{out}/like-pc.png'); await c.screenshot(path=f'{out}/like-mobile.png')
    print('甲', await a.evaluate(CNT)); print('乙', await c.evaluate(CNT))
    print('曲 結果中', await a.evaluate("JSON.stringify({playing:!__sd.music.el.paused,ct:__sd.music.el.currentTime})"))
    await a.wait_for_function('__sd.S.phase==0', timeout=40000); await a.wait_for_timeout(1800)
    print('曲 次の巡り', await a.evaluate("JSON.stringify({playing:!__sd.music.el.paused,result:document.getElementById('result').classList.contains('on'),hud:document.getElementById('hud').classList.contains('on')})"))
    await a.screenshot(path=f'{out}/like-next.png')
    print('\n'.join(logs) or 'no errors')
    await b.close()
asyncio.run(main())
