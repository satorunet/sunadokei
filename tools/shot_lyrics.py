#!/usr/bin/env python3
# 歌詞ページの確認。使い方: shot_lyrics.py <出力先> <サイトのURL>
import sys, asyncio, os
from playwright.async_api import async_playwright
out, url = sys.argv[1], sys.argv[2]
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    for tag, kw in (('pc', {'viewport':{'width':1280,'height':720}}), ('m', {'viewport':{'width':390,'height':844},'has_touch':True,'is_mobile':True})):
      c = await b.new_context(accept_downloads=True, **kw); pg = await c.new_page(); logs=[]
      pg.on('console', lambda m: logs.append(m.text) if m.type=='error' else None); pg.on('pageerror', lambda e: logs.append('PE '+str(e)))
      await pg.goto(url); await pg.wait_for_timeout(1500)
      await pg.click('#menuBtn'); await pg.click('#menuPanel a[href="lyrics.html"]'); await pg.wait_for_load_state(); await pg.wait_for_timeout(1000)
      print(tag, pg.url, await pg.title(), '行数', await pg.locator('.ln').count())
      print('横はみ出し', await pg.evaluate("document.documentElement.scrollWidth>innerWidth"))
      await pg.screenshot(path=f'{out}/lyrics-{tag}.png')
      async with pg.expect_download(timeout=30000) as d: await pg.click('.dl')
      dl = await d.value; path = await dl.path()
      print('DL', dl.suggested_filename, os.path.getsize(path), open(path,'rb').read(3))
      # 行を押すとそこから再生して光る
      await pg.locator('.ln').nth(10).click(); await pg.wait_for_timeout(2000)
      print('再生', await pg.evaluate("JSON.stringify({playing:!a.paused,t:+a.currentTime.toFixed(1),on:document.querySelector('.ln.on')?.textContent})"))
      await pg.screenshot(path=f'{out}/lyrics-{tag}2.png')
      # プレイヤーの操作
      await pg.click('#play'); await pg.wait_for_timeout(300); print('一時停止', await pg.evaluate("a.paused"), await pg.get_attribute('#play','aria-label'))
      await pg.evaluate("seek.value=100;seek.dispatchEvent(new Event('input'));seek.dispatchEvent(new Event('change'))"); await pg.wait_for_timeout(500)
      print('シーク', await pg.evaluate("[+a.currentTime.toFixed(0),document.getElementById('time').textContent]"))
      await pg.click('#mute'); print('消音', await pg.evaluate("a.muted"), await pg.get_attribute('#mute','aria-label')); await pg.click('#mute')
      await pg.click('#play'); await pg.wait_for_timeout(1000); print('再開', await pg.evaluate("[!a.paused,document.getElementById('time').textContent]"))
      await pg.evaluate("scrollTo(0,500)"); await pg.wait_for_timeout(300); await pg.screenshot(path=f'{out}/lyrics-{tag}3.png')
      await pg.evaluate("a.pause();scrollTo(0,0)")
      await pg.click('.back'); await pg.wait_for_load_state(); print('戻る', pg.url)
      print(logs or 'no errors'); await c.close()
    await b.close()
asyncio.run(main())
