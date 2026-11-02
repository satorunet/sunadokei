#!/usr/bin/env python3
# OGカード(1200x630)を実際の3D描画から作る。使い方: og.py <URL> <出力png>
import sys, asyncio
from playwright.async_api import async_playwright
url, out = sys.argv[1], sys.argv[2]
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg = await b.new_page(viewport={'width':1200,'height':630})
    await pg.goto(url); await pg.wait_for_timeout(2500)
    await pg.evaluate("""()=>{
      const c=__sd.camera; c.zoom=1.42; c.setViewOffset(1200,630,-270,-4,1200,630);
      document.querySelector('.entry').style.display='none';
      const t=document.getElementById('title');t.style.cssText+=';background:linear-gradient(90deg,#0a0713ee 0,#0a0713aa 42%,#0a071300 62%);align-items:flex-start;justify-content:center;padding:0 0 0 64px;';
      const l=document.querySelector('.logo');l.style.textAlign='left';
      l.innerHTML='<h1 style="font-size:104px;letter-spacing:.06em;margin:0;line-height:1.15">命の<br>砂時計</h1><p style="font-size:29px;letter-spacing:.14em;margin:22px 0 0">あなたの命は、残り何秒か。</p><p class="sans" style="font-size:21px;letter-spacing:.08em;margin:18px 0 0;color:#f6eddd">大人数で遊ぶオンライン3Dゲーム</p>';
    }""")
    await pg.wait_for_timeout(2500)
    await pg.screenshot(path=out)
    await b.close()
asyncio.run(main())
