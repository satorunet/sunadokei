#!/usr/bin/env python3
# スマホ横持ち表示の確認。使い方: shot_mobile.py <出力先> <URL>
import sys, asyncio
from playwright.async_api import async_playwright
out, url = sys.argv[1], sys.argv[2]
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx = await b.new_context(viewport={'width':844,'height':390}, has_touch=True, is_mobile=True, device_scale_factor=1)
    pg = await ctx.new_page()
    logs=[]
    pg.on('console', lambda m: logs.append(m.type+': '+m.text) if m.type=='error' else None)
    pg.on('pageerror', lambda e: logs.append('PAGEERROR: '+str(e)))
    await pg.goto(url); await pg.wait_for_timeout(3000)
    await pg.screenshot(path=f'{out}/m-title.png')
    await pg.fill('#name','確認'); await pg.click('#go')
    await pg.wait_for_function('__sd.S.joined&&__sd.S.total>0', timeout=30000)
    await pg.wait_for_timeout(3000)
    await pg.screenshot(path=f'{out}/m-play.png')
    print(await pg.evaluate("JSON.stringify({cls:document.documentElement.className,total:__sd.S.total,humans:__sd.S.humans,phase:__sd.S.phase})"))
    print('\n'.join(logs) or 'no errors')
    await b.close()
asyncio.run(main())
