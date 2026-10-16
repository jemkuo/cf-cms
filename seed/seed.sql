DELETE FROM post_tags;
DELETE FROM translations;
DELETE FROM posts;
DELETE FROM tag_translations;
DELETE FROM tags;

INSERT INTO tags (slug, created_at) VALUES ('edge', '2026-04-08T09:00:00.000Z');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('edge', 'zh', '边缘');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('edge', 'en', 'Edge');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('edge', 'ja', 'エッジ');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('edge', 'es', 'Borde');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('edge', 'ar', 'الحافة');
INSERT INTO tags (slug, created_at) VALUES ('workers-ai', '2026-04-08T09:00:00.000Z');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('workers-ai', 'zh', 'Workers AI');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('workers-ai', 'en', 'Workers AI');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('workers-ai', 'ja', 'Workers AI');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('workers-ai', 'es', 'Workers AI');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('workers-ai', 'ar', 'Workers AI');
INSERT INTO tags (slug, created_at) VALUES ('i18n', '2026-04-08T09:00:00.000Z');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('i18n', 'zh', '多语言');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('i18n', 'en', 'i18n');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('i18n', 'ja', '多言語');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('i18n', 'es', 'i18n');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('i18n', 'ar', 'تعدد اللغات');
INSERT INTO tags (slug, created_at) VALUES ('seo', '2026-06-16T09:00:00.000Z');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('seo', 'zh', 'SEO');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('seo', 'en', 'SEO');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('seo', 'ja', 'SEO');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('seo', 'es', 'SEO');
INSERT INTO tag_translations (tag_slug, lang, name) VALUES ('seo', 'ar', 'SEO');
INSERT INTO posts (id, slug, status, category, cover_key, author_name, author_x, source_lang, translate_note, published_at, created_at, updated_at) VALUES ('post_small_models', 'small-models-at-the-edge', 'published', 'engineering', '/covers/edge.svg', 'Field Notes', '', 'zh', '', '2026-04-08T09:00:00.000Z', '2026-04-07T09:00:00.000Z', '2026-04-08T09:00:00.000Z');
INSERT INTO translations (post_id, lang, title, description, summary, body_md, faq_json, share_text, engine, ready, locked, updated_at) VALUES ('post_small_models', 'zh', '小模型该住在边缘', '把翻译留在发布按钮上，而不是每次阅读的请求里。一篇关于 Workers AI、免费额度和五种语言的笔记。', '作者用一种语言写完。发布时才调用模型，译文落在 D1 里，阅读路径不再等待。', '大多数团队把「智能」想成一次远程调用：请求飞到远处的大模型，再飞回来。聊天窗口可以忍受这个来回。一篇博客、一个发布按钮，不该这样等。

这个站点把模型留在写入的一侧。作者用一种语言写完，按下发布，翻译在同一次操作里完成，结果写进 D1。读者之后打开的是已经写好的页面，而不是一段还在加载的脚本。

## 为什么要在发布时翻译

三件具体的事：

1. **费用可预期。** Workers AI 的免费额度按天重置。翻译发生在发布，而不是每一次阅读。

2. **译文可修改。** 机器给出的是草稿。标题、术语和分享到 X 的那句话都应该能改，改过的语言可以被锁定。

3. **爬虫看到完整的页面。** 搜索引擎和回答引擎读到的是语义完整的 HTML，包括摘要和 FAQ，而不是一个空容器。

## 边缘适合做什么

| 适合 | 不适合 |
| --- | --- |
| 翻译、摘要、FAQ、分类 | 把整段对话都押在免费额度上 |
| 发布时跑一次 | 在每次页面请求里等待大模型 |
| 人可以改的草稿 | 不可追溯的现场生成 |

短代码、链接和嵌入标记不会送去翻译。下面这段调用保持原样：

```ts
const translated = await env.AI.run("@cf/meta/m2m100-1.2b", {
  text: paragraph,
  source_lang: "zh",
  target_lang: "ar",
});
```

## 跟 X 的关系

技术讨论常常不发生在文章下面的评论框里。每篇文章准备一句分享文案，正文里也可以嵌一条公开帖。

{{x:https://x.com/jack/status/20}}

没有嵌入时，页面不会去请求第三方脚本。

## 阿拉伯语不是多出来的一种语言

从右到左，不是把 `dir` 设上就结束。导航、列表和引用线沿着行内方向翻转，代码块则始终从左到右。`hreflang` 使用 `ar`，站点地图和 RSS 也各有一份阿拉伯语版本。西班牙语同样进入路由、站点地图和语言切换：`/es/`。

## 可以带走的原则

- 一种源语言，多种已经发布的译文。
- 模型调用放在写入路径，阅读路径只读数据库和对象存储。
- 摘要和 FAQ 既给人读，也给生成式引擎读。', '[{"q":"源语言必须是中文吗？","a":"默认是简体中文。后台可以把五种语言里的任意一种设为源语言，其余语言在发布时生成。"},{"q":"免费额度用完了会怎样？","a":"原文仍会保存。自动翻译会标成待处理，可以稍后重试，也可以自己贴上译文。"},{"q":"译文会在下次发布时被覆盖吗？","a":"锁定过的语言不会。没有锁定、且仍是自动草稿的语言，才会在你要求重新翻译时更新。"}]', '小模型该住在边缘：翻译放在发布时，阅读路径不再等模型。', 'human', '1', '1', '2026-04-08T09:00:00.000Z');
INSERT INTO translations (post_id, lang, title, description, summary, body_md, faq_json, share_text, engine, ready, locked, updated_at) VALUES ('post_small_models', 'en', 'Small models belong at the edge', 'Leave translation on the publish button, not on every read. A note on Workers AI, the free allotment, and five languages.', 'The author writes in one language. The model runs at publish time, the translation lands in D1, and the read path does not wait.', 'Most teams picture intelligence as a round trip: the request flies to a large model somewhere else, then flies back. A chat window can wait. A blog post and a publish button should not.

This site keeps the model on the write path. The author finishes in one language, hits publish, and the translation happens in that same action. The result is a row in D1. Later, a reader opens a finished page rather than a script that is still loading.

## Why translate at publish time

Three concrete reasons:

1. **Cost stays predictable.** The Workers AI free allotment resets daily. Translation happens when you publish, not on every read.

2. **The draft can be edited.** The model hands you a draft. The title, the terms, and the sentence you share on X should be editable, and a language you have touched can be locked.

3. **Crawlers see a complete page.** Search engines and answer engines read semantic HTML, including the summary and the FAQ, not an empty shell.

## What belongs at the edge

| Fits | Does not fit |
| --- | --- |
| Translation, summaries, FAQ, labels | Betting a whole conversation on the free allotment |
| One run at publish time | Waiting on a large model inside every page request |
| A draft a person can revise | Ephemeral generation with no record |

Short code, links, and embed markers are not sent to the translator. This call stays as written:

```ts
const translated = await env.AI.run("@cf/meta/m2m100-1.2b", {
  text: paragraph,
  source_lang: "zh",
  target_lang: "ar",
});
```

## The relationship with X

Technical discussion rarely lives in the comment box under a post. Each article keeps a share line, and the body can embed one public post.

{{x:https://x.com/jack/status/20}}

When there is no embed, the page does not request a third-party script.

## Arabic is not an extra language

Right-to-left is not finished when you set `dir`. Navigation, lists, and the quotation rule follow the inline direction, while code stays left to right. `hreflang` uses `ar`, and the sitemap and RSS each have an Arabic edition. Spanish joins the routes, the sitemap, and the switcher at `/es/`.

## What to keep

- One source language, and several published translations.
- Model calls on the write path. The read path only touches the database and object storage.
- A summary and a FAQ that a person can read, and a generative engine can read too.', '[{"q":"Does the source language have to be Chinese?","a":"Simplified Chinese is the default. The admin can choose any of the five languages as the source. The others are generated on publish."},{"q":"What happens when the free allotment runs out?","a":"The source is still saved. Automatic translation is marked pending. You can retry later or paste a translation yourself."},{"q":"Will the next publish overwrite a translation?","a":"A locked language is kept. An unlocked automatic draft is replaced only when you ask for a fresh translation."}]', 'Small models belong at the edge: translate on publish, and stop making readers wait.', 'human', '1', '1', '2026-04-08T09:00:00.000Z');
INSERT INTO translations (post_id, lang, title, description, summary, body_md, faq_json, share_text, engine, ready, locked, updated_at) VALUES ('post_small_models', 'ja', '小さなモデルはエッジに置く', '翻訳は公開ボタンに置き、読むたびのリクエストには置かない。Workers AI、無料枠、五つの言語についてのノート。', '著者は一つの言語で書き終える。モデルは公開時に走り、訳文は D1 に落ち、読む経路は待たない。', '多くのチームは「知能」を往復の呼び出しだと考えます。リクエストが遠い大きなモデルへ飛び、戻ってくる。チャット窓なら待てます。ブログと公開ボタンは、そう待つべきではありません。

このサイトはモデルを書く側に残します。著者は一つの言語で書き終え、公開を押す。翻訳はその同じ操作の中で終わり、結果は D1 の一行になります。読者が後で開くのは、完成したページであり、まだ読み込み中のスクリプトではありません。

## なぜ公開時に訳すのか

具体的な理由は三つです。

1. **費用が見積もれる。** Workers AI の無料枠は日ごとに戻ります。翻訳は公開時に起き、読むたびに起きません。

2. **訳文は直せる。** モデルが出すのは下書きです。題名、用語、X に共有する一文は編集でき、手を入れた言語はロックできます。

3. **クローラは完全なページを見る。** 検索エンジンと回答エンジンが読むのは、要約と FAQ を含む意味のある HTML であり、空の容器ではありません。

## エッジに向く仕事

| 向く | 向かない |
| --- | --- |
| 翻訳、要約、FAQ、分類 | 会話全体を無料枠に賭ける |
| 公開時に一度だけ走らせる | ページ要求のたびに大きなモデルを待つ |
| 人が直せる下書き | 追跡できないその場の生成 |

短いコード、リンク、埋め込み記号は翻訳に送りません。次の呼び出しはそのまま残します。

```ts
const translated = await env.AI.run("@cf/meta/m2m100-1.2b", {
  text: paragraph,
  source_lang: "zh",
  target_lang: "ar",
});
```

## X との関係

技術的な議論は、記事の下のコメント欄では起きにくいものです。各記事は共有用の一文を持ち、本文に公開投稿を一つ埋め込めます。

{{x:https://x.com/jack/status/20}}

埋め込みがなければ、ページは第三者のスクリプトを要求しません。

## アラビア語は付け足しではない

右から左へ、は `dir` を付けて終わりではありません。ナビゲーション、リスト、引用線は行の方向に沿い、コードブロックは左から右のままです。`hreflang` は `ar` を使い、サイトマップと RSS にもアラビア語版があります。スペイン語も経路とサイトマップと言語切替に入ります。`/es/` です。

## 持って帰る原則

- 源言語は一つ、公開された訳文は複数。
- モデル呼び出しは書く経路へ。読む経路はデータベースとオブジェクトストレージだけを読む。
- 要約と FAQ は人にも、生成エンジンにも読ませる。', '[{"q":"源言語は中国語でなければなりませんか？","a":"既定は簡体字中国語です。管理画面では五つの言語のどれでも源言語にでき、残りは公開時に生成されます。"},{"q":"無料枠を使い切るとどうなりますか？","a":"原文は保存されます。自動翻訳は未処理として残り、後で再試行するか、自分で訳文を貼れます。"},{"q":"次の公開で訳文は上書きされますか？","a":"ロックした言語は残ります。ロックされていない自動下書きだけが、再翻訳を頼んだときに更新されます。"}]', '小さなモデルはエッジに置く。翻訳は公開時に済ませ、読者を待たせない。', 'human', '1', '1', '2026-04-08T09:00:00.000Z');
INSERT INTO translations (post_id, lang, title, description, summary, body_md, faq_json, share_text, engine, ready, locked, updated_at) VALUES ('post_small_models', 'es', 'Los modelos pequeños pertenecen al borde', 'Deja la traducción en el botón de publicar, no en cada lectura. Una nota sobre Workers AI, la cuota gratuita y cinco idiomas.', 'El autor escribe en un idioma. El modelo corre al publicar, la traducción cae en D1 y la ruta de lectura no espera.', 'La mayoría de los equipos imagina la inteligencia como un viaje de ida y vuelta: la petición vuela hasta un modelo grande y regresa. Una ventana de chat puede esperar. Un blog y un botón de publicar, no.

Este sitio deja el modelo en el lado de la escritura. El autor termina en un idioma, pulsa publicar, y la traducción ocurre en esa misma acción. El resultado es una fila en D1. Quien lee después abre una página terminada, no un script que todavía carga.

## Por qué traducir al publicar

Hay tres razones concretas:

1. **El coste se puede prever.** La cuota gratuita de Workers AI se reinicia cada día. La traducción ocurre al publicar, no en cada lectura.

2. **El borrador se puede editar.** El modelo entrega un borrador. El título, los términos y la frase que compartes en X tienen que poder cambiarse, y un idioma ya tocado se puede bloquear.

3. **El rastreador ve una página completa.** Los buscadores y los motores de respuesta leen HTML con significado, resumen y preguntas, no un recipiente vacío.

## Qué cabe en el borde

| Cabe | No cabe |
| --- | --- |
| Traducción, resumen, FAQ, etiquetas | Apostar toda una conversación a la cuota gratuita |
| Una pasada al publicar | Esperar un modelo grande en cada petición de página |
| Un borrador que una persona puede corregir | Generación efímera sin registro |

El código corto, los enlaces y las marcas de incrustación no se envían al traductor. Esta llamada se queda igual:

```ts
const translated = await env.AI.run("@cf/meta/m2m100-1.2b", {
  text: paragraph,
  source_lang: "zh",
  target_lang: "ar",
});
```

## La relación con X

La discusión técnica casi nunca vive en la caja de comentarios. Cada texto guarda una frase para compartir, y el cuerpo puede incrustar una publicación pública.

{{x:https://x.com/jack/status/20}}

Si no hay incrustación, la página no pide un script de terceros.

## El árabe no es un idioma de más

De derecha a izquierda no termina al poner `dir`. La navegación, las listas y la línea de la cita siguen la dirección de la línea, y el código sigue de izquierda a derecha. `hreflang` usa `ar`, y el sitemap y el RSS tienen cada uno una edición árabe. El español entra en las rutas, el sitemap y el conmutador: `/es/`.

## Qué conviene guardar

- Un idioma de origen y varias traducciones publicadas.
- Las llamadas al modelo en la ruta de escritura. La ruta de lectura solo toca la base de datos y el almacenamiento de objetos.
- Un resumen y unas preguntas que pueda leer una persona, y también un motor generativo.', '[{"q":"¿El idioma de origen tiene que ser el chino?","a":"El predeterminado es chino simplificado. En el admin se puede elegir cualquiera de los cinco como origen. Los demás se generan al publicar."},{"q":"¿Qué pasa si se agota la cuota gratuita?","a":"El original se guarda igual. La traducción automática queda pendiente. Puedes reintentar o pegar una traducción."},{"q":"¿La siguiente publicación pisa la traducción?","a":"Un idioma bloqueado se conserva. Un borrador automático sin bloquear solo se sustituye cuando pides traducir de nuevo."}]', 'Los modelos pequeños pertenecen al borde: traduce al publicar y no hagas esperar a quien lee.', 'human', '1', '1', '2026-04-08T09:00:00.000Z');
INSERT INTO translations (post_id, lang, title, description, summary, body_md, faq_json, share_text, engine, ready, locked, updated_at) VALUES ('post_small_models', 'ar', 'النماذج الصغيرة مكانها الحافة', 'اترك الترجمة على زر النشر، لا على كل قراءة. ملاحظة عن Workers AI والحصة المجانية وخمس لغات.', 'يكتب المؤلف بلغة واحدة. يعمل النموذج عند النشر، وتستقر الترجمة في D1، ومسار القراءة لا ينتظر.', 'تتخيل أغلب الفرق «الذكاء» كرحلة ذهاب وإياب: يطير الطلب إلى نموذج كبير بعيد ثم يعود. نافذة الدردشة تحتمل الانتظار. المقالة وزر النشر لا ينبغي أن ينتظرا.

يبقي هذا الموقع النموذج في جهة الكتابة. يُنهي المؤلف النص بلغة واحدة، ويضغط نشر، وتحدث الترجمة في العملية نفسها. النتيجة صف في D1. حين يفتح القارئ الصفحة لاحقًا يجد نصًا جاهزًا، لا سكربتًا ما زال يحمّل.

## لماذا نترجم عند النشر

ثلاثة أسباب محددة:

1. **التكلفة قابلة للتوقع.** الحصة المجانية من Workers AI تُصفَّر كل يوم. الترجمة تحدث عند النشر، لا عند كل قراءة.

2. **المسودة قابلة للتحرير.** ما يسلمه النموذج مسودة. العنوان والمصطلحات وجملة المشاركة على X يجب أن تُعدَّل، واللغة التي مُسّت يمكن قفلها.

3. **الزاحف يرى صفحة كاملة.** محركات البحث ومحركات الإجابة تقرأ HTML مكتمل المعنى، مع الملخص والأسئلة، لا حاوية فارغة.

## ما الذي يناسب الحافة

| يناسب | لا يناسب |
| --- | --- |
| الترجمة والملخص والأسئلة والتصنيف | رهن المحادثة كلها بالحصة المجانية |
| تشغيل واحد عند النشر | انتظار نموذج كبير في كل طلب صفحة |
| مسودة يستطيع الإنسان تعديلها | توليد عابر بلا أثر |

الشيفرة القصيرة والروابط وعلامات التضمين لا تُرسل إلى المترجم. هذا الاستدعاء يبقى كما هو:

```ts
const translated = await env.AI.run("@cf/meta/m2m100-1.2b", {
  text: paragraph,
  source_lang: "zh",
  target_lang: "ar",
});
```

## العلاقة مع X

النقاش التقني نادرًا ما يعيش في صندوق التعليقات. كل مقالة تحتفظ بجملة للمشاركة، ويمكن تضمين منشور علني واحد داخل المتن.

{{x:https://x.com/jack/status/20}}

إذا لم يوجد تضمين، لا تطلب الصفحة أي سكربت طرف ثالث.

## العربية ليست لغة إضافية

الكتابة من اليمين إلى اليسار لا تنتهي بضبط `dir`. التنقل والقوائم وخط الاقتباس تتبع اتجاه السطر، وتبقى كتل الشيفرة من اليسار إلى اليمين. يستخدم `hreflang` القيمة `ar`، ولكل من خريطة الموقع و RSS نسخة عربية. الإسبانية تدخل المسارات وخريطة الموقع ومبدّل اللغة عبر `/es/`.

## ما يمكن الاحتفاظ به

- لغة مصدر واحدة، وعدة ترجمات منشورة.
- استدعاء النموذج في مسار الكتابة. مسار القراءة لا يلمس إلا قاعدة البيانات وتخزين الملفات.
- ملخص وأسئلة يقرأها الإنسان، ويقرأها محرك توليدي أيضًا.', '[{"q":"هل يجب أن تكون لغة المصدر الصينية؟","a":"الافتراضي هو الصينية المبسطة. يمكن في لوحة الإدارة اختيار أي لغة من الخمس كمصدر، وتُولَّد البقية عند النشر."},{"q":"ماذا يحدث إذا نفدت الحصة المجانية؟","a":"يُحفظ الأصل. تُعلَّم الترجمة التلقائية كقيد الانتظار. يمكن إعادة المحاولة لاحقًا أو لصق ترجمة."},{"q":"هل يستبدل النشر التالي الترجمة؟","a":"اللغة المقفلة تبقى. المسودة التلقائية غير المقفلة لا تُستبدل إلا عندما تطلب ترجمة جديدة."}]', 'النماذج الصغيرة مكانها الحافة: ترجم عند النشر، ولا تُبقِ القارئ منتظرًا.', 'human', '1', '1', '2026-04-08T09:00:00.000Z');
INSERT INTO post_tags (post_id, tag_slug) VALUES ('post_small_models', 'edge');
INSERT INTO post_tags (post_id, tag_slug) VALUES ('post_small_models', 'workers-ai');
INSERT INTO post_tags (post_id, tag_slug) VALUES ('post_small_models', 'i18n');
INSERT INTO posts (id, slug, status, category, cover_key, author_name, author_x, source_lang, translate_note, published_at, created_at, updated_at) VALUES ('post_llms_directory', 'a-directory-for-answer-engines', 'published', 'notes', NULL, 'Field Notes', '', 'zh', '', '2026-06-16T09:00:00.000Z', '2026-06-15T09:00:00.000Z', '2026-06-16T09:00:00.000Z');
INSERT INTO translations (post_id, lang, title, description, summary, body_md, faq_json, share_text, engine, ready, locked, updated_at) VALUES ('post_llms_directory', 'zh', '给回答引擎一份目录', 'llms.txt 是短目录，llms-full.txt 是全文。两者都只收录已经发布的译文。', '回答引擎需要一份能引用的目录。页面本身的摘要、FAQ 和语言版本就是那份目录的正文。', '回答引擎不会把你的网站当成一串 div。它找的是一份能引用的目录：这是什么、有哪些语言、每篇文章在讲什么。

`llms.txt` 是那份短目录。`llms-full.txt` 放上全文。两者都从已经发布的译文生成，而不是从后台草稿。

## 页面上要有什么

- 每种语言一条干净的 URL：`/zh/`、`/en/`、`/ja/`、`/es/`、`/ar/`。
- 文章里有摘要，有 FAQ，有面包屑。
- 阿拉伯语页面声明 `dir="rtl"`，同时出现在 hreflang、站点地图和 RSS 里。

人读到的结构和模型读到的结构是同一份。目录只是把它写得更短。', '[{"q":"llms.txt 会包含草稿吗？","a":"不会。只有已发布、且该语言译文标记为可公开的文章才会进入目录、站点地图和 RSS。"}]', '给回答引擎一份目录：llms.txt、五种语言，以及从右到左的阿拉伯语页面。', 'human', '1', '1', '2026-06-16T09:00:00.000Z');
INSERT INTO translations (post_id, lang, title, description, summary, body_md, faq_json, share_text, engine, ready, locked, updated_at) VALUES ('post_llms_directory', 'en', 'A directory for answer engines', 'llms.txt is the short directory. llms-full.txt is the full text. Both list only published translations.', 'An answer engine needs a directory it can cite. The summary, the FAQ, and the language editions are the body of that directory.', 'An answer engine does not read your site as a pile of divs. It looks for a directory it can cite: what this is, which languages exist, and what each essay says.

`llms.txt` is the short directory. `llms-full.txt` carries the full text. Both are built from published translations, not from drafts in the admin.

## What the page needs

- A clean URL per language: `/zh/`, `/en/`, `/ja/`, `/es/`, `/ar/`.
- A summary, a FAQ, and breadcrumbs inside the article.
- Arabic pages that set `dir="rtl"` and show up in hreflang, the sitemap, and RSS.

The structure a person reads and the structure a model reads are the same one. The directory is just the short version.', '[{"q":"Does llms.txt include drafts?","a":"No. Only published posts with a public translation in that language are listed in the directory, the sitemap, and the RSS feed."}]', 'A directory for answer engines: llms.txt, five languages, and Arabic pages that run right to left.', 'human', '1', '1', '2026-06-16T09:00:00.000Z');
INSERT INTO translations (post_id, lang, title, description, summary, body_md, faq_json, share_text, engine, ready, locked, updated_at) VALUES ('post_llms_directory', 'ja', '回答エンジンのための目録', 'llms.txt は短い目録、llms-full.txt は全文。どちらも公開済みの訳文だけを載せます。', '回答エンジンには引用できる目録が要ります。ページの要約、FAQ、言語版が、その目録の本文です。', '回答エンジンは、サイトを div の山としては読みません。引用できる目録を探します。これは何か、どの言語があるか、各文章が何を言っているか。

`llms.txt` は短い目録です。`llms-full.txt` は全文を載せます。どちらも公開済みの訳文から作り、管理画面の下書きからは作りません。

## ページに必要なもの

- 言語ごとのきれいな URL。`/zh/`、`/en/`、`/ja/`、`/es/`、`/ar/`。
- 記事の中の要約、FAQ、パンくず。
- `dir="rtl"` を宣言し、hreflang とサイトマップと RSS に出るアラビア語ページ。

人が読む構造とモデルが読む構造は同じです。目録は、それを短く書いたものです。', '[{"q":"llms.txt に下書きは入りますか？","a":"入りません。公開済みで、その言語の訳文が公開可になっている記事だけが目録、サイトマップ、RSS に出ます。"}]', '回答エンジンのための目録。llms.txt、五つの言語、右から左へ組むアラビア語。', 'human', '1', '1', '2026-06-16T09:00:00.000Z');
INSERT INTO translations (post_id, lang, title, description, summary, body_md, faq_json, share_text, engine, ready, locked, updated_at) VALUES ('post_llms_directory', 'es', 'Un directorio para los motores de respuesta', 'llms.txt es el directorio corto. llms-full.txt es el texto completo. Los dos listan solo traducciones publicadas.', 'Un motor de respuesta necesita un directorio que pueda citar. El resumen, las preguntas y las ediciones de idioma son el cuerpo de ese directorio.', 'Un motor de respuesta no lee el sitio como un montón de divs. Busca un directorio que pueda citar: qué es esto, qué idiomas hay y qué dice cada texto.

`llms.txt` es el directorio corto. `llms-full.txt` lleva el texto completo. Los dos salen de traducciones publicadas, no de borradores del admin.

## Qué necesita la página

- Una URL limpia por idioma: `/zh/`, `/en/`, `/ja/`, `/es/`, `/ar/`.
- Un resumen, unas preguntas y migas dentro del artículo.
- Páginas en árabe con `dir="rtl"`, presentes en hreflang, el sitemap y el RSS.

La estructura que lee una persona y la que lee un modelo son la misma. El directorio es solo la versión corta.', '[{"q":"¿llms.txt incluye borradores?","a":"No. Solo entran los textos publicados cuya traducción en ese idioma está marcada como pública."}]', 'Un directorio para los motores de respuesta: llms.txt, cinco idiomas y páginas en árabe de derecha a izquierda.', 'human', '1', '1', '2026-06-16T09:00:00.000Z');
INSERT INTO translations (post_id, lang, title, description, summary, body_md, faq_json, share_text, engine, ready, locked, updated_at) VALUES ('post_llms_directory', 'ar', 'فهرس لمحركات الإجابة', 'llms.txt فهرس قصير، وllms-full.txt هو النص الكامل. كلاهما لا يدرج إلا الترجمات المنشورة.', 'يحتاج محرك الإجابة إلى فهرس يستطيع الاستشهاد به. الملخص والأسئلة ونسخ اللغات هي متن ذلك الفهرس.', 'محرك الإجابة لا يقرأ الموقع ككومة من عناصر div. يبحث عن فهرس يستطيع الاستشهاد به: ما هذا، وأي لغات موجودة، وماذا تقول كل مقالة.

`llms.txt` هو الفهرس القصير. `llms-full.txt` يحمل النص الكامل. كلاهما يُبنى من الترجمات المنشورة، لا من مسودات لوحة الإدارة.

## ماذا تحتاج الصفحة

- عنوانًا نظيفًا لكل لغة: `/zh/` و`/en/` و`/ja/` و`/es/` و`/ar/`.
- ملخصًا وأسئلة ومسار تنقل داخل المقالة.
- صفحات عربية تضبط `dir="rtl"` وتظهر في hreflang وخريطة الموقع و RSS.

البنية التي يقرأها الإنسان والبنية التي يقرأها النموذج واحدة. الفهرس هو نسختها القصيرة.', '[{"q":"هل يضم llms.txt المسودات؟","a":"لا. لا يدخل الفهرس وخريطة الموقع و RSS إلا المقالات المنشورة التي ترجمتها في تلك اللغة معلّمة كعلنية."}]', 'فهرس لمحركات الإجابة: llms.txt، وخمس لغات، وصفحات عربية من اليمين إلى اليسار.', 'human', '1', '1', '2026-06-16T09:00:00.000Z');
INSERT INTO post_tags (post_id, tag_slug) VALUES ('post_llms_directory', 'seo');
INSERT INTO post_tags (post_id, tag_slug) VALUES ('post_llms_directory', 'i18n');
INSERT INTO posts (id, slug, status, category, cover_key, author_name, author_x, source_lang, translate_note, published_at, created_at, updated_at) VALUES ('post_glossary_draft', 'glossary-draft', 'draft', 'research', NULL, 'Field Notes', '', 'zh', '', NULL, '2026-09-12T09:00:00.000Z', '2026-09-12T09:00:00.000Z');
INSERT INTO translations (post_id, lang, title, description, summary, body_md, faq_json, share_text, engine, ready, locked, updated_at) VALUES ('post_glossary_draft', 'zh', '术语表还没写完', '这是一篇草稿，用来确认未发布的文章不会进入公开页面。', '发布之前，它不会出现在任何语言的列表、站点地图或 RSS 里。', '这篇还是草稿。发布之前，它不会出现在任何语言的列表、站点地图、RSS 或 llms.txt 里。', '[]', '术语表还没写完。', 'human', '1', '1', '2026-09-12T09:00:00.000Z');
INSERT INTO post_tags (post_id, tag_slug) VALUES ('post_glossary_draft', 'i18n');
