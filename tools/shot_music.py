#!/usr/bin/env python3
# プレイ中の小さな曲と結果発表の切り替えを確認する。TIME_SCALE を付けたサーバーで使う。使い方: shot_music.py <出力先> <URL>
import sys, asyncio
from playwright.async_api import async_playwright
out, url = sys.argv[1], sys.argv[2]
ST="JSON.stringify({playing:!__sd.music.el.paused,gain:+(__sd.music.gain?__sd.music.gain.gain.value:-1).toFixed(2),t:+__sd.music.el.currentTime.toFixed(1),phase:__sd.S.phase,btn:document.getElementById('bgmGame').textContent})"
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg = await b.new_page(viewport={'width':1280,'height':720}); logs=[]
    pg.on('pageerror', lambda e: logs.append('PE '+str(e))); pg.on('console', lambda m: logs.append(m.text) if m.type=='error' else None)
    await pg.goto(url); await pg.wait_for_timeout(2000)
    print('説明欄', await pg.evaluate("JSON.stringify({spans:document.querySelectorAll('.rules span').length,tops:[...document.querySelectorAll('.rules div')].map(d=>Math.round(d.getBoundingClientRect().top))})"))
    await pg.screenshot(path=f'{out}/rules-fixed.png')
    await pg.fill('#name','確認'); await pg.click('#go'); await pg.wait_for_function('__sd.S.joined',timeout=20000); await pg.wait_for_timeout(2500)
    print('プレイ中', await pg.evaluate(ST)); await pg.screenshot(path=f'{out}/hud-btn.png')
    await pg.evaluate("document.exitPointerLock&&document.exitPointerLock()"); await pg.wait_for_timeout(200)
    await pg.click('#bgmGame'); await pg.wait_for_timeout(300); print('曲を切る', await pg.evaluate(ST))
    await pg.click('#bgmGame'); await pg.wait_for_timeout(1800); print('曲を入れる', await pg.evaluate(ST))
    await pg.click('#mute'); await pg.wait_for_timeout(300); print('音 切', await pg.evaluate(ST))
    await pg.click('#mute'); await pg.wait_for_timeout(1800); print('音 入', await pg.evaluate(ST))
    await pg.wait_for_function("document.getElementById('result').classList.contains('on')", timeout=90000); await pg.wait_for_timeout(1000)
    print('結果発表', await pg.evaluate(ST))
    await pg.wait_for_function('__sd.S.phase==0', timeout=40000); await pg.wait_for_timeout(2200)
    print('次の巡り', await pg.evaluate(ST))
    print(logs or 'no errors'); await b.close()
asyncio.run(main())
