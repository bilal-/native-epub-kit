const paragraph =
  'This fixture text was written for Native EPUB Kit. It is intentionally short, neutral, and reusable in automated tests.';

const ltrProgressParagraphs = Array.from({ length: 32 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  return `<p id="ltr-progress-${number}">LTR progress paragraph ${number}. Vertical scrolling must advance a continuous resource locator without crossing into another reading-order resource.</p>`;
}).join('\n');

const rtlProgressParagraphs = Array.from({ length: 24 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  return `<p id="rtl-progress-${number}" lang="ur" dir="rtl" class="urdu">اردو پیش رفت پیراگراف ${number}۔ عمودی مطالعہ اسی باب میں جاری رہتا ہے اور افقی اشارہ اگلا باب نہیں کھولتا۔</p>`;
}).join('\n');

function annotationStressFiller(paragraphIndex) {
  let state = (0x9e3779b9 ^ (paragraphIndex + 1)) >>> 0;

  return Array.from({ length: 24 }, (_, tokenIndex) => {
    state = (Math.imul(state ^ (tokenIndex + 1), 1664525) + 1013904223) >>> 0;
    return `s${state.toString(36).padStart(7, '0')}`;
  }).join(' ');
}

const annotationParagraphs = Array.from({ length: 2048 }, (_, index) => {
  const number = String(index + 1).padStart(4, '0');
  return `<p id="paragraph-${number}" data-test-anchor="${number}"><span id="segment-${number}">Addressable paragraph ${number}.</span> Selection geometry and decoration tests can target this stable text without relying on a copyrighted publication. Position tokens: ${annotationStressFiller(index)}</p>`;
}).join('\n');

export const fixtureDefinitions = [
  {
    id: 'minimal-en',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000001',
    title: 'Minimal English Fixture',
    language: 'en',
    direction: 'ltr',
    documents: [
      {
        id: 'chapter-1',
        href: 'text/chapter-1.xhtml',
        title: 'First chapter',
        body: `<h1 id="ltr-progress-start">First chapter</h1><p>${paragraph}</p>${ltrProgressParagraphs}<p id="ltr-progress-end">End of the first scrolling chapter.</p>`,
      },
      {
        id: 'chapter-2',
        href: 'text/chapter-2.xhtml',
        title: 'Second chapter',
        body: `<h1 id="ltr-next-resource">Second chapter</h1><p>${paragraph}</p><p>This second spine item proves explicit next-resource navigation after cross-resource swipe gestures are disabled.</p>${ltrProgressParagraphs}`,
      },
    ],
  },
  {
    id: 'toc-complex',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000002',
    title: 'Nested and Fragment TOC Fixture',
    language: 'en',
    direction: 'ltr',
    documents: [
      {
        id: 'part-1',
        href: 'text/part-1.xhtml',
        title: 'Part one',
        body: [
          '<h1>Part one</h1>',
          '<section id="opening"><h2>Opening fragment</h2><p>The first navigation target is in this resource.</p></section>',
          '<section id="detail"><h2>Detailed fragment</h2><p>A nested table-of-contents entry targets this sibling fragment.</p></section>',
        ].join(''),
      },
      {
        id: 'part-2',
        href: 'text/part-2.xhtml',
        title: 'Part two',
        body: [
          '<h1>Part two</h1>',
          '<section id="continuation"><h2>Continuation fragment</h2><p>This target crosses a resource boundary.</p></section>',
          '<section id="deep-target"><h3>Deep target</h3><p>This third-level target exercises nested TOC flattening.</p></section>',
        ].join(''),
      },
    ],
    toc: [
      {
        label: 'Part one',
        href: 'text/part-1.xhtml',
        children: [
          { label: 'Opening', href: 'text/part-1.xhtml#opening' },
          { label: 'Detail', href: 'text/part-1.xhtml#detail' },
        ],
      },
      {
        label: 'Part two',
        href: 'text/part-2.xhtml#continuation',
        children: [
          {
            label: 'Continuation',
            href: 'text/part-2.xhtml#continuation',
            children: [{ label: 'Deep target', href: 'text/part-2.xhtml#deep-target' }],
          },
        ],
      },
    ],
  },
  {
    id: 'footnotes',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000003',
    title: 'Footnote and Link Fixture',
    language: 'en',
    direction: 'ltr',
    documents: [
      {
        id: 'reading',
        href: 'text/reading.xhtml',
        title: 'Reading with notes',
        body: [
          '<h1>Reading with notes</h1>',
          '<p>The first note stays in this resource<a id="ref-local" epub:type="noteref" href="#note-local" aria-label="Open semantic footnote one"><sup>1</sup></a>. The second note crosses into another resource<a id="ref-cross" epub:type="noteref" href="notes.xhtml#note-cross" aria-label="Open semantic footnote two"><sup>2</sup></a>.</p>',
          '<p><a id="ordinary-internal" href="ordinary.xhtml#ordinary-target" aria-label="Follow ordinary internal destination">Ordinary internal link</a> must navigate rather than open a footnote.</p>',
          '<p>A legacy publisher note omits EPUB semantics<a id="heuristic-reference" href="notes.xhtml#note-legacy" aria-label="Open heuristic legacy note"><sup>3</sup></a> and must use the conservative native fallback.</p>',
          '<p>A semantic candidate can be downgraded by the consumer<a id="consumer-reference" epub:type="noteref" href="#consumer-navigate" aria-label="Follow consumer classified destination"><sup>4</sup></a>.</p>',
          '<p>An <a id="external-reference" href="https://example.com/reference" aria-label="Open external reference">external reference</a> exercises link policy without bundling remote content.</p>',
          '<p>An <a id="unsupported-reference" href="mailto:reader@example.com" aria-label="Open unsupported mail link">unsupported mail link</a> is blocked by policy.</p>',
          '<aside id="note-local" epub:type="footnote"><h2>Footnote one</h2><p>This same-resource note contains <em>formatted text</em>. <a epub:type="backlink" href="#ref-local" aria-label="Back to reference one">↩</a></p></aside>',
          '<aside id="consumer-navigate" epub:type="footnote"><h2>Consumer classifier destination</h2><p>This semantic target is navigated instead of shown as a footnote. <a id="consumer-backlink" epub:type="backlink" href="#consumer-reference" aria-label="Back to consumer reference">↩</a></p></aside>',
        ].join(''),
      },
      {
        id: 'notes',
        href: 'text/notes.xhtml',
        title: 'Cross-resource notes',
        linear: false,
        body: [
          '<h1>Cross-resource notes</h1>',
          '<aside id="note-cross" epub:type="footnote"><h2>Footnote two</h2><p>This note lives in a separate XHTML resource and includes a <a href="https://example.com/nested">nested link</a>. <a epub:type="backlink" href="reading.xhtml#ref-cross" aria-label="Back to reference two">↩</a></p></aside>',
          '<aside id="note-legacy" lang="ur" dir="rtl"><h2>روایتی حاشیہ</h2><p>یہ غیر معنوی حاشیہ مقامی درجہ بندی سے کھلتا ہے۔</p><p>Legacy heuristic content keeps multiple paragraphs and mixed English.</p></aside>',
        ].join(''),
      },
      {
        id: 'ordinary',
        href: 'text/ordinary.xhtml',
        title: 'Ordinary internal destination',
        body: [
          '<h1 id="ordinary-target">Ordinary internal destination</h1>',
          '<p>This linear reading-order resource proves that an ordinary internal link follows normal navigator behavior.</p>',
        ].join(''),
      },
    ],
    toc: [{ label: 'Reading with notes', href: 'text/reading.xhtml' }],
    extraCss: `
a[epub|type~='noteref'],
#ordinary-internal,
#heuristic-reference,
#consumer-reference,
#external-reference,
#unsupported-reference {
  border: 0.12em solid #c9a227;
  border-radius: 0.35em;
  display: inline-block;
  margin: 0.25em;
  padding: 0.3em 0.55em;
}
`,
  },
  {
    id: 'rtl-custom-font',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000004',
    title: 'RTL and Custom Font Fixture',
    language: 'ur',
    direction: 'rtl',
    pageProgressionDirection: 'rtl',
    extraCss: `
@font-face {
  font-family: 'Noto Sans Arabic Fixture';
  src: url('../fonts/NotoSansArabic.ttf') format('truetype');
  font-style: normal;
  font-weight: 400;
}

body {
  font-family: 'Noto Sans Arabic Fixture', sans-serif;
}

.selection-target {
  border: 2px solid #c9a227;
  border-radius: 8px;
  font-size: 1.45em;
  padding: 0.7em;
}
`,
    resources: [
      {
        id: 'noto-sans-arabic',
        href: 'fonts/NotoSansArabic.ttf',
        mediaType: 'font/ttf',
        assetId: 'noto-sans-arabic-variable',
      },
    ],
    documents: [
      {
        id: 'urdu-reading',
        href: 'text/urdu-reading.xhtml',
        title: 'اردو مطالعہ',
        body: [
          '<h1>اردو مطالعہ</h1>',
          '<p id="rtl-selection-target" lang="ur" dir="rtl" class="urdu selection-target">منطقی انتخاب عبارت بیالیس</p>',
          '<p lang="ur" class="urdu">یہ ایک آزمائشی کتاب ہے۔ اس کا متن صرف دائیں سے بائیں مطالعے، انتخاب اور صفحہ بندی کی جانچ کے لیے لکھا گیا ہے۔</p>',
          '<p lang="ar" class="arabic">هذا نص تجريبي للقراءة واختبار اتجاه الكتابة العربية.</p>',
          '<p lang="ar" class="quranic">وَآخِرُ دَعْوَانَا أَنِ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ</p>',
          '<p id="ltr-selection-target" lang="en" dir="ltr" class="english selection-target">English profile sample with a stable locator and selectable range.</p>',
          '<p>ایک انگریزی شناخت <bdi dir="ltr">Reader-42</bdi> اسی سطر میں موجود ہے۔</p>',
          '<p><a href="font-license.xhtml">شامل فونٹ کا اجازت نامہ</a></p>',
          rtlProgressParagraphs,
          '<p id="rtl-progress-end" lang="ur" dir="rtl" class="urdu">پہلے عمودی باب کا اختتام۔</p>',
        ].join(''),
      },
      {
        id: 'urdu-continuation',
        href: 'text/urdu-continuation.xhtml',
        title: 'اردو مطالعہ دوم',
        body: [
          '<h1 id="rtl-next-resource" lang="ur" dir="rtl">اردو مطالعہ دوم</h1>',
          '<p lang="ur" dir="rtl" class="urdu">یہ دوسرا خطی باب صرف واضح اگلے باب کی نیویگیشن ثابت کرنے کے لیے ہے۔</p>',
          rtlProgressParagraphs,
        ].join(''),
      },
      {
        id: 'font-license',
        href: 'text/font-license.xhtml',
        title: 'Noto Sans Arabic font license',
        language: 'en',
        direction: 'ltr',
        linear: false,
        bodyFromAsset: 'noto-sans-arabic-license',
      },
    ],
    toc: [
      { label: 'اردو مطالعہ', href: 'text/urdu-reading.xhtml' },
      { label: 'اردو مطالعہ دوم', href: 'text/urdu-continuation.xhtml' },
    ],
  },
  {
    id: 'mixed-bidi',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000005',
    title: 'Mixed Bidirectional Text Fixture',
    language: 'en',
    direction: 'ltr',
    documents: [
      {
        id: 'mixed',
        href: 'text/mixed.xhtml',
        title: 'Mixed directions',
        body: [
          '<h1>Mixed directions</h1>',
          '<p>English before <bdi dir="rtl" lang="ur">اردو متن ۱۲۳</bdi> and English after.</p>',
          '<p dir="rtl" lang="ar">نص عربي يتضمن الرمز <bdi dir="ltr">ISBN 978-1-4028-9462-6</bdi> ثم يعود إلى العربية.</p>',
          '<p><bdo dir="rtl">Forced visual direction sample 123</bdo></p>',
          '<blockquote dir="rtl" lang="ur"><p>دائیں سے بائیں اقتباس، پھر <span dir="ltr">LTR inline 456</span>، پھر واپسی۔</p></blockquote>',
        ].join(''),
      },
    ],
  },
  {
    id: 'images',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000006',
    title: 'Image Interaction Fixture',
    language: 'en',
    direction: 'ltr',
    resources: [
      {
        id: 'reading-illustration',
        href: 'images/reading-illustration.svg',
        mediaType: 'image/svg+xml',
        contents: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" role="img" aria-labelledby="title description">
  <title id="title">Abstract open book</title>
  <desc id="description">Two warm pages open against a navy background with a gold bookmark.</desc>
  <rect width="800" height="500" fill="#14213d"/>
  <path d="M95 95c120-30 220 0 305 70v255c-85-70-185-100-305-70z" fill="#f5f0e4"/>
  <path d="M705 95c-120-30-220 0-305 70v255c85-70 185-100 305-70z" fill="#fffaf0"/>
  <path d="M400 165v255" stroke="#c9a227" stroke-width="12"/>
  <path d="M415 165h42v150l-21-20-21 20z" fill="#c9a227"/>
</svg>`,
      },
    ],
    documents: [
      {
        id: 'gallery',
        href: 'text/gallery.xhtml',
        title: 'Image gallery',
        body: [
          '<h1>Image gallery</h1>',
          '<figure id="primary-image"><img src="../images/reading-illustration.svg" alt="An abstract open book on a navy background with a gold bookmark."/><figcaption>Generated vector art for zoom, long-press, and sharing tests.</figcaption></figure>',
        ].join(''),
      },
    ],
  },
  {
    id: 'malformed-link',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000007',
    title: 'Malformed Link Negative Fixture',
    language: 'en',
    direction: 'ltr',
    documents: [
      {
        id: 'broken-links',
        href: 'text/broken-links.xhtml',
        title: 'Broken links',
        body: '<h1>Broken links</h1><p><a href="missing-resource.xhtml#absent-fragment">This intentionally missing target</a> must be surfaced safely by the reader and reported by EPUBCheck.</p>',
      },
    ],
  },
  {
    id: 'annotation-stress',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000008',
    title: 'Annotation Stress Fixture',
    language: 'en',
    direction: 'ltr',
    documents: [
      {
        id: 'stress',
        href: 'text/stress.xhtml',
        title: '2,048 addressable paragraphs',
        body: `<h1>2,048 addressable paragraphs</h1>${annotationParagraphs}`,
      },
    ],
  },
  {
    id: 'fixed-layout',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000009',
    title: 'Fixed Layout Fixture',
    language: 'en',
    direction: 'ltr',
    renditionLayout: 'pre-paginated',
    documents: [
      {
        id: 'fixed-page-1',
        href: 'page/fixed-1.xhtml',
        title: 'Fixed page one',
        body: [
          '<main style="box-sizing:border-box;height:1500px;padding:120px;width:1100px;background:#14213d;color:#fffaf0">',
          '<h1>Fixed page one</h1>',
          '<p>This authored 1200 by 1600 viewport proves fixed-layout detection and capability gating.</p>',
          '</main>',
        ].join(''),
      },
      {
        id: 'fixed-page-2',
        href: 'page/fixed-2.xhtml',
        title: 'Fixed page two',
        body: [
          '<main style="box-sizing:border-box;height:1500px;padding:120px;width:1100px;background:#fffaf0;color:#14213d">',
          '<h1>Fixed page two</h1>',
          '<p>Font and reflow controls must be reported as incompatible for this publication.</p>',
          '</main>',
        ].join(''),
      },
    ],
  },
  {
    id: 'search-failure',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000010',
    title: 'Search Resource Failure Fixture',
    language: 'en',
    direction: 'ltr',
    documents: [
      {
        id: 'search-readable',
        href: 'text/search-readable.xhtml',
        title: 'Readable search resource',
        body: '<h1>Readable search resource</h1><p>The reader can open this first spine item before a search reaches the intentionally unavailable resource.</p>',
      },
      {
        id: 'search-unavailable',
        href: 'text/search-unavailable.xhtml',
        title: 'Unavailable search resource',
        body: '<h1>Unavailable search resource</h1>',
        omitFromArchive: true,
      },
    ],
    toc: [{ label: 'Readable search resource', href: 'text/search-readable.xhtml' }],
  },
];
