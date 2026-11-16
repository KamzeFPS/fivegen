import { ArrowDown, ArrowRight, ChevronDown, CirclePlay, Clapperboard, Globe2, Scissors, ShieldCheck, TrendingUp } from 'lucide-react';

type Language = 'mn' | 'en';
const copy = {
  mn: {
    announcement: 'Сайн мөчийг хүн бүрт хүргэ.', announcementLink: 'Клип хийж эхлэх',
    discover: 'Кампанит ажлууд', how: 'Хэрхэн ажилладаг вэ', faq: 'Асуулт, хариулт', signin: 'Нэвтрэх', start: 'Эхлэх',
    eyebrow: 'САЙН КОНТЕНТ. ИЛҮҮ ОЛОН ХҮНД.',
    title: 'Клип бүтээ.\nНөлөөгөө тэл.', subtitle: 'Кампанит ажлаа сонгоод бэлэн видеогоо илгээгээрэй. Админ хянаж зөвшөөрөхөд клип брэндийн сошиал сувгуудад нийтлэгдэнэ.',
    browse: 'Кампанит ажил үзэх', seeHow: 'Хэрхэн ажиллах вэ', free: 'Үнэгүй бүртгэл · Монгол + English',
    heroArtAlt: 'Камер барьсан бүтээгч, бүжигчин болон хөрөг зургийг хослуулсан улбар шар өнгийн уран эвлүүлэг.',
    strip: 'Таны бүтээл. Брэндийн сувгуудаар.',
    stepsEyebrow: 'САНААНААС НИЙТЛЭЛ ХҮРТЭЛ', stepsTitle: 'Сайн клипээс\nбүх зүйл эхэлнэ.',
    steps: [
      ['Тохирох ажлаа ол', 'Кампанит ажлын заавар, нийтлэх платформ, төсөв болон урамшууллын нөхцөлийг уншаарай.'],
      ['Өөрийнхөөрөө бүтээ', 'Зөвшөөрөгдсөн эх бичлэгээс сонирхолтой мөчийг сонгож, өөрийн өнгө аястай клип бүтээгээрэй.'],
      ['Видеогоо илгээ', 'Бэлэн клипээ MP4 файлаар илгээнэ. Админ хянаад зөвшөөрөхөд брэндийн сонгосон сувгуудад нийтлэгдэнэ.'],
    ],
    featureEyebrow: 'БҮТЭЭГЧДЭД ЗОРИУЛАВ', featureTitle: 'Бүтээлдээ төвлөр.\nЯвцаа нэг дор хар.',
    features: [
      ['Нээлттэй нөхцөл', 'Нэгдэхээсээ өмнө урамшууллын хэмжээ, төсөв, шаардлагаа харна.'],
      ['Клип бүрийн явц', 'Илгээсэн клип, хяналтын төлөв, админы тайлбарыг нэг дороос.'],
      ['Брэндийн сувгуудаар', 'Админ зөвшөөрсөн видеог холбосон TikTok, Instagram эсвэл YouTube хаягт нийтэлнэ.'],
      ['Хоёр хэлээр', 'Монгол, англи хэлний хооронд хүссэн үедээ шилжинэ.'],
    ],
    faqTitle: 'Эхлэхээсээ өмнө',
    questions: [
      ['Клиппер гэж хэн бэ?', 'Эх бичлэгийн сонирхолтой мөчийг богино видео болгон бүтээдэг бүтээгч. Кампанит ажлын дүрэм, эх материалын зөвшөөрлийг дагаж бэлэн видеогоо илгээнэ.'],
      ['Хэрхэн нэгдэх вэ?', 'FiveGen бүртгэлээрээ нэвтэрч, нээлттэй кампанит ажлаа сонгоно. Зааврыг уншаад 100 MB хүртэл MP4 видеогоо илгээнэ.'],
      ['Урамшууллыг хэрхэн тооцох вэ?', 'Кампанит ажлаас хамааран баталгаажуулсан 1,000 үзэлт тутамд эсвэл зөвшөөрөгдсөн нийтлэл бүрд тооцно. Доод, дээд хэмжээ болон нийт төсвийг кампанит ажлын хуудсанд харуулна.'],
      ['Клип илгээсний дараа яах вэ?', 'Админ видеог үзэж, тайлбар болон нийтлэх брэндийн хаягуудыг сонгоно. Зөвшөөрөхөд видео нийтлэх дараалалд орно. Та хяналт, нийтлэлийн төлөв болон тайлбарыг өөрийн булангаас харна.'],
      ['Бүртгүүлэхэд төлбөртэй юу?', 'Клипперээр бүртгүүлж, нээлттэй кампанит ажлуудыг үзэхэд төлбөргүй. Нэгдэхээсээ өмнө тухайн кампанит ажлын бүх нөхцөлийг уншаарай.'],
    ],
    ctaEyebrow: 'ДАРААГИЙН ШИЛДЭГ КЛИП ТАНЫХ.', ctaTitle: 'Таны өнцөг.\nШинэ боломж.', ctaText: 'Кампанит ажлаа сонгоод эхний клипээ бүтээгээрэй.',
    admin: 'Админ', privacy: 'Нууцлал', terms: 'Үйлчилгээний нөхцөл', footer: 'Сайн мөчийг илүү олон хүнд.', rights: 'Бүх эрх хуулиар хамгаалагдсан.',
  },
  en: {
    announcement: 'Great moments deserve a bigger audience.', announcementLink: 'Start clipping',
    discover: 'Campaigns', how: 'How it works', faq: 'FAQs', signin: 'Sign in', start: 'Get started',
    eyebrow: 'GREAT CONTENT. GREATER REACH.',
    title: 'Make clips.\nMake an impact.', subtitle: 'Choose a campaign and upload your finished video. After admin approval, your clip is published on the brand’s social channels.',
    browse: 'Explore campaigns', seeHow: 'See how it works', free: 'Free to join · Монгол + English',
    heroArtAlt: 'Orange editorial collage of a camera-holding creator, a dancer and an expressive portrait.',
    strip: 'Your creativity. The brand’s channels.',
    stepsEyebrow: 'FROM THE FIRST CUT TO THE FEED', stepsTitle: 'It starts with\na great clip.',
    steps: [
      ['Find your campaign', 'Read the brief, explore the brand’s platforms, and check the budget and reward terms.'],
      ['Make it your own', 'Find the moment in the approved source content and turn it into a clip with your own creative perspective.'],
      ['Upload your video', 'Send your finished clip as an MP4 file. The admin reviews it and approves publication to the selected brand channels.'],
    ],
    featureEyebrow: 'BUILT AROUND THE CREATOR', featureTitle: 'Keep creating.\nKeep track of it all.',
    features: [
      ['Clear from the start', 'See the rate, budget, and creative requirements before you join.'],
      ['Every clip, in view', 'Your submissions, review status, and feedback, together in one place.'],
      ['On the brand’s channels', 'Approved clips publish to the brand’s connected TikTok, Instagram or YouTube accounts.'],
      ['Two languages. One space.', 'Switch between Mongolian and English whenever you need.'],
    ],
    faqTitle: 'Before the first cut',
    questions: [
      ['What is a clipper?', 'A creator who turns interesting moments from source content into short videos. Follow the campaign’s source permissions and requirements, then upload your finished video.'],
      ['How do I join?', 'Sign in with your FiveGen account, choose an open campaign, and read its brief. Then upload your MP4 video, up to 100 MB.'],
      ['How are rewards calculated?', 'Depending on the campaign, rewards are calculated per 1,000 verified views or per approved post. The campaign page shows the rate, payout limits, and total budget.'],
      ['What happens after I submit?', 'The admin watches the video and reviews the caption and brand destinations. Approval queues the video for publication. Track its review status, publishing status and feedback in your workspace.'],
      ['Does it cost anything to join?', 'Registering as a clipper and browsing open campaigns is free. Read the full terms of each campaign before joining.'],
    ],
    ctaEyebrow: 'THE NEXT GREAT CLIP COULD BE YOURS.', ctaTitle: 'Your perspective.\nA new possibility.', ctaText: 'Find a campaign and make your first cut.',
    admin: 'Admin', privacy: 'Privacy', terms: 'Terms', footer: 'Good moments. Bigger audiences.', rights: 'All rights reserved.',
  },
};

function Brand() {
  return <span className="clipper-lp-brand"><span className="clipper-lp-brand-symbol" aria-hidden="true"><Scissors size={24} strokeWidth={2.1} /></span><span>FiveGen<span className="clipper-lp-brand-small">Clipper</span></span></span>;
}

const stepArtwork = ['discover', 'create', 'publish'];

export function ClipperLanding({ lang, appOrigin }: { lang: Language; appOrigin: string }) {
  const t = copy[lang];
  const workspace = `${appOrigin}/clipper/app?lang=${lang}`;
  const icons = [ShieldCheck, TrendingUp, Clapperboard, Globe2];
  return <div className="clipper-lp" lang={lang}>
    <a className="clipper-lp-skip" href="#clipper-main">{lang === 'mn' ? 'Үндсэн агуулга руу' : 'Skip to content'}</a>
    <div className="clipper-lp-announcement"><span>{t.announcement}</span><a href={workspace}>{t.announcementLink}<ArrowRight size={14} /></a></div>
    <header className="clipper-lp-header">
      <a href={lang === 'en' ? '?lang=en' : '?lang=mn'} aria-label="FiveGen Clipper"><Brand /></a>
      <nav className="clipper-lp-nav" aria-label={lang === 'mn' ? 'Үндсэн цэс' : 'Main navigation'}>
        <a href={workspace}>{t.discover}</a><a href="#how-it-works">{t.how}</a><a href="#clipper-faq">{t.faq}</a>
      </nav>
      <div className="clipper-lp-header-actions"><div className="clipper-lp-languages" aria-label="Language / Хэл"><a href="?lang=mn" lang="mn" aria-current={lang === 'mn' ? 'true' : undefined}>MN</a><a href="?lang=en" lang="en" aria-current={lang === 'en' ? 'true' : undefined}>EN</a></div><a className="clipper-lp-signin" href={workspace}>{t.signin}</a><a className="clipper-lp-button clipper-lp-button-small" href={workspace}>{t.start}<ArrowRight size={16} /></a></div>
    </header>
    <main id="clipper-main">
      <section className="clipper-lp-hero">
        <div className="clipper-lp-hero-copy"><span className="clipper-lp-eyebrow"><span />{t.eyebrow}</span><h1>{t.title.split('\n').map((line, i) => <span key={line} className={i === 1 ? 'clipper-lp-title-second' : ''}>{line}</span>)}</h1><p>{t.subtitle}</p><div className="clipper-lp-hero-actions"><a className="clipper-lp-button" href={workspace}>{t.browse}<ArrowRight size={18} /></a><a className="clipper-lp-text-link" href="#how-it-works"><CirclePlay size={20} />{t.seeHow}</a></div><span className="clipper-lp-free">{t.free}</span></div>
        <figure className="clipper-lp-hero-art">
          {/* This generated artwork is pre-optimized and served directly as a local asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/clipper-hero-art.webp" srcSet="/brand/clipper-hero-art-888.webp 888w, /brand/clipper-hero-art.webp 1774w" sizes="(max-width: 760px) calc(100vw - 36px), (min-width: 1600px) 1160px, (min-width: 1176px) 1120px, calc(100vw - 56px)" width={1774} height={887} alt={t.heroArtAlt} fetchPriority="high" decoding="async" />
        </figure>
      </section>
      <div className="clipper-lp-platforms"><span>{t.strip}</span><strong><span className="clipper-lp-tiktok">♪</span>TikTok</strong><strong><Instagram size={22} />Instagram</strong><strong><Youtube size={25} />YouTube</strong></div>
      <section className="clipper-lp-section clipper-lp-how" id="how-it-works">
        <div className="clipper-lp-section-heading"><span className="clipper-lp-eyebrow">{t.stepsEyebrow}</span><h2>{t.stepsTitle}</h2><ArrowDown className="clipper-lp-section-arrow" size={27} strokeWidth={1.5} /></div>
        <div className="clipper-lp-steps">{t.steps.map(([title, description], i) => <article className="clipper-lp-step" key={title}>
          <div className="clipper-lp-step-art">
            {/* This generated artwork is pre-optimized and served directly as a local asset. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/brand/clipper-step-${stepArtwork[i]}.webp`} width={960} height={720} alt="" aria-hidden="true" loading="lazy" decoding="async" />
          </div><div className="clipper-lp-step-copy"><span className="clipper-lp-step-number">0{i + 1}</span><h3>{title}</h3><p>{description}</p></div>
        </article>)}</div>
      </section>
      <section className="clipper-lp-section clipper-lp-features"><div className="clipper-lp-feature-heading"><span className="clipper-lp-eyebrow">{t.featureEyebrow}</span><h2>{t.featureTitle}</h2><a className="clipper-lp-text-link" href={workspace}>{t.browse}<ArrowRight size={18} /></a></div><div className="clipper-lp-feature-grid">{t.features.map(([title, description], i) => { const Icon = icons[i]; return <article key={title}><span className="clipper-lp-feature-icon"><Icon size={23} strokeWidth={1.6} /></span><h3>{title}</h3><p>{description}</p></article>; })}</div></section>
      <section className="clipper-lp-section clipper-lp-faq" id="clipper-faq"><div><span className="clipper-lp-eyebrow">FAQ</span><h2>{t.faqTitle}</h2></div><div>{t.questions.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={19} /></summary><p>{answer}</p></details>)}</div></section>
      <section className="clipper-lp-final">
        <div className="clipper-lp-final-inner"><span className="clipper-lp-eyebrow">{t.ctaEyebrow}</span><h2>{t.ctaTitle}</h2><p>{t.ctaText}</p><a className="clipper-lp-button" href={workspace}>{t.start}<ArrowRight size={18} /></a></div>
        <div className="clipper-lp-final-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/clipper-cta-art.webp" width={1200} height={900} alt="" aria-hidden="true" loading="lazy" decoding="async" />
        </div>
      </section>
    </main>
    <footer className="clipper-lp-footer"><div className="clipper-lp-footer-top"><a href={lang === 'en' ? '?lang=en' : '?lang=mn'} aria-label="FiveGen Clipper"><Brand /></a><p>{t.footer}</p><a href={workspace}>{t.discover}<ArrowRight size={15} /></a></div><div className="clipper-lp-footer-bottom"><span>© {new Date().getUTCFullYear()} FiveGen. {t.rights}</span><nav aria-label={lang === 'mn' ? 'Нэмэлт холбоос' : 'Footer navigation'}><a href={`${appOrigin}/clipper/admin?lang=${lang}`}>{t.admin}</a><a href={`${appOrigin}/privacy`}>{t.privacy}</a><a href={`${appOrigin}/terms`}>{t.terms}</a></nav></div></footer>
  </div>;
}

function Instagram({ size = 22 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.8" r=".8" fill="currentColor" stroke="none" /></svg>; }
function Youtube({ size = 25 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 26 22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="2" y="4" width="22" height="14" rx="4" /><path d="m11 8 6 3-6 3V8Z" fill="currentColor" stroke="none" /></svg>; }
