#!/usr/bin/env python3
# トップ画面の ≡ メニューと遊び方を確認する。使い方: shot_menu.py <出力先> <URL>
import sys, asyncio
from playwright.async_api import async_playwright
out, url = sys.argv[1], sys.argv[2]
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    for tag, kw in (('pc', {'viewport':{'width':1280,'height':720}}), ('mobile', {'viewport':{'width':390,'height':844},'has_touch':True,'is_mobile':True})):
      c = await b.new_context(**kw); pg = await c.new_page(); logs=[]
      pg.on('pageerror', lambda e: logs.append('PE '+str(e)))
      await pg.goto(url); await pg.wait_for_timeout(1800)
      await pg.evaluate("window.__se=[];for(const k of ['uiTap','uiOk']){const f=__sd.sound[k].bind(__sd.sound);__sd.sound[k]=()=>{__se.push(k);f()}}")
      await pg.click('#menuBtn'); print(tag, repr(await pg.inner_text('#menuPanel')))
      await pg.click('#menuHelp'); await pg.wait_for_timeout(300)
      print('開く', await pg.is_visible('#help'), '操作表', await pg.is_visible('#helpBox .pc'), await pg.is_visible('#helpBox .sp'))
      print('スクロール', await pg.evaluate("(()=>{const h=document.getElementById('help');h.scrollTop=99999;return [h.scrollTop,h.scrollHeight,h.clientHeight]})()"))
      await pg.evaluate("document.getElementById('help').scrollTop=0")
      await pg.screenshot(path=f'{out}/help-{tag}.png')
      await pg.keyboard.press('Escape'); print('Esc', await pg.is_visible('#help'))
      await pg.click('#menuBtn'); await pg.click('#menuHelp'); await pg.click('#helpClose'); print('✕', await pg.is_visible('#help'))
      await pg.click('#bgm'); await pg.click('#menuBtn'); await pg.click('#menuBtn'); await pg.click('#opbtn'); await pg.wait_for_timeout(300); await pg.click('#opclose')
      print('効果音', await pg.evaluate("__se.join(',')"), 'ctx', await pg.evaluate("__sd.sound.ctx&&__sd.sound.ctx.state"))
      print(logs or 'no errors'); await c.close()
    await b.close()
asyncio.run(main())
