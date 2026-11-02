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
    # 矢印と効果音
    await a.wait_for_function('__sd.S.joined', timeout=30000)
    await a.wait_for_function('__sd.arrow.visible', timeout=60000)
    await a.wait_for_timeout(500); await a.screenshot(path=f'{out}/arrow.png')
    print('矢印', await a.evaluate("JSON.stringify({vis:__sd.arrow.visible,phase:__sd.S.phase,g:__sd.grains.map.size})"))
    await a.wait_for_function("document.getElementById('result').classList.contains('on')", timeout=120000)
    await c.wait_for_function("document.getElementById('result').classList.contains('on')", timeout=30000)
    rows = await a.evaluate("[...document.querySelectorAll('#rlist .lk')].map(b=>+b.dataset.id)")
    me = await a.evaluate("__sd.S.id"); other = await c.evaluate("__sd.S.id")
    print('行数', len(rows), '甲乙が載る', me in rows, other in rows)
    # 甲が乙に130連打（1通の上限を超えても取りこぼさない）、乙が甲に3回
    await a.evaluate(f"for(let i=0;i<130;i++)document.querySelector('#rlist .lk[data-id=\"{other}\"]').dispatchEvent(new PointerEvent('pointerdown',{{bubbles:true,cancelable:true}}))")
    await c.evaluate(f"document.querySelector('#rlist .lk[data-id=\"{me}\"]').scrollIntoView()")
    for i in range(3): await c.tap(f'#rlist .lk[data-id="{me}"]')
    await a.wait_for_timeout(1500)
    await a.screenshot(path=f'{out}/like-pc.png'); await c.screenshot(path=f'{out}/like-mobile.png')
    CNTS = "id=>JSON.stringify({row:document.querySelector(`#rlist .lk[data-id=\"${id}\"] b`).textContent,got:document.getElementById('likeMine').textContent,total:document.getElementById('likeTotal').textContent})"
    print('甲の画面 乙の行', await a.evaluate(CNTS, other)); print('乙の画面 乙の行', await c.evaluate(CNTS, other)); print('乙の画面 甲の行', await c.evaluate(CNTS, me))
    print('曲 結果中', await a.evaluate("!__sd.music.el.paused"))
    await a.wait_for_function('__sd.S.phase==0', timeout=40000); await a.wait_for_timeout(1800)
    print('曲 次の巡り', await a.evaluate("!__sd.music.el.paused"))
    print('\n'.join(logs) or 'no errors')
    await b.close()
asyncio.run(main())
