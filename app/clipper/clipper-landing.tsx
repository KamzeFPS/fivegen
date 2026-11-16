import { ArrowDown, ArrowRight, Check, ChevronDown, CirclePlay, Clapperboard, Clock3, Globe2, Scissors, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';

type Language = 'mn' | 'en';
const copy = {
  mn: {
    announcement: 'Сайн мөчийг хүн бүрт хүргэ.', announcementLink: 'Клип хийж эхлэх',
    discover: 'Кампанит ажлууд', how: 'Хэрхэн ажилладаг вэ', faq: 'Асуулт, хариулт', signin: 'Нэвтрэх', start: 'Эхлэх',
    eyebrow: 'САЙН КОНТЕНТ. ИЛҮҮ ОЛОН ХҮНД.',
    title: 'Клип бүтээ.\nНөлөөгөө тэл.', subtitle: 'Брэндүүд кампанит ажил зарлана. Та шилдэг мөчийг клип болгож, нийтлээд, урамшуулал авах боломжтой.',
    browse: 'Кампанит ажил үзэх', seeHow: 'Хэрхэн ажиллах вэ', free: 'Үнэгүй бүртгэл · Монгол + English',
    stageTitle: 'ТОМ САНАА.\nБОГИНО КЛИП.', stageCaption: 'Нэг мөчөөс. Олон хүнд.', source: 'Эх бичлэг', cut: 'Өөрийн өнцгөөр', publish: 'Нийтэл. Хүргэ.',
    strip: 'Таны бүтээл. Таны платформ.',
    stepsEyebrow: 'САНААНААС НИЙТЛЭЛ ХҮРТЭЛ', stepsTitle: 'Сайн клипээс\nбүх зүйл эхэлнэ.',
    steps: [
      ['Тохирох ажлаа ол', 'Кампанит ажлын заавар, платформ, төсөв болон урамшууллын нөхцөлийг уншаад нэгдээрэй.'],
      ['Өөрийнхөөрөө бүтээ', 'Зөвшөөрөгдсөн эх бичлэгээс сонирхолтой мөчийг сонгож, өөрийн өнгө аястай клип бүтээгээрэй.'],
      ['Нийтлээд илгээ', 'Клипээ өөрийн сувгаар нийтлээд холбоосыг илгээнэ. Админ хянасны дараа үр дүн, урамшууллаа хараарай.'],
    ],
    campaign: 'Кампанит ажил', brief: 'Тодорхой заавар', platforms: 'Сонгосон платформууд', joined: 'Нэгдэх', reviewing: 'Хянаж байна', approved: 'Зөвшөөрсөн',
    featureEyebrow: 'БҮТЭЭГЧДЭД ЗОРИУЛАВ', featureTitle: 'Бүтээлдээ төвлөр.\nЯвцаа нэг дор хар.',
    features: [
      ['Нээлттэй нөхцөл', 'Нэгдэхээсээ өмнө урамшууллын хэмжээ, төсөв, шаардлагаа харна.'],
      ['Клип бүрийн явц', 'Илгээсэн клип, хяналтын төлөв, админы тайлбарыг нэг дороос.'],
      ['Өөрийн сувгаар', 'TikTok, Instagram эсвэл YouTube — кампанит ажилд зөвшөөрсөн платформоор.'],
      ['Хоёр хэлээр', 'Монгол, англи хэлний хооронд хүссэн үедээ шилжинэ.'],
    ],
    faqTitle: 'Эхлэхээсээ өмнө',
    questions: [
      ['Клиппер гэж хэн бэ?', 'Эх бичлэгийн сонирхолтой мөчийг богино видео болгон бүтээж, өөрийн сошиал сувгаар нийтэлдэг бүтээгч. Кампанит ажил бүрийн эх бичлэг ашиглах зөвшөөрөл, дүрмийг дагана.'],
      ['Хэрхэн нэгдэх вэ?', 'FiveGen бүртгэлээрээ нэвтэрч, бүтээгчийн мэдээллээ бөглөнө. Нээлттэй кампанит ажлын зааврыг уншаад нэгдэж болно.'],
      ['Урамшууллыг хэрхэн тооцох вэ?', 'Кампанит ажлаас хамааран баталгаажуулсан 1,000 үзэлт тутамд эсвэл зөвшөөрөгдсөн нийтлэл бүрд тооцно. Доод, дээд хэмжээ болон нийт төсвийг кампанит ажлын хуудсанд харуулна.'],
      ['Клип илгээсний дараа яах вэ?', 'Админ нийтлэлийн холбоос, агуулга, шаардлага болон үзэлтийг хянана. Та өөрийн илгээсэн ажлын төлөв, тайлбар, зөвшөөрөгдсөн урамшууллыг харна. Төлбөрийн нөхцөлийг тухайн кампанит ажлын заавраас шалгаарай.'],
      ['Бүртгүүлэхэд төлбөртэй юу?', 'Клипперээр бүртгүүлж, нээлттэй кампанит ажлуудыг үзэхэд төлбөргүй. Нэгдэхээсээ өмнө тухайн кампанит ажлын бүх нөхцөлийг уншаарай.'],
    ],
    ctaEyebrow: 'ДАРААГИЙН ШИЛДЭГ КЛИП ТАНЫХ.', ctaTitle: 'Таны өнцөг.\nШинэ боломж.', ctaText: 'Кампанит ажлаа сонгоод эхний клипээ бүтээгээрэй.',
    admin: 'Админ', privacy: 'Нууцлал', terms: 'Үйлчилгээний нөхцөл', footer: 'Сайн мөчийг илүү олон хүнд.', rights: 'Бүх эрх хуулиар хамгаалагдсан.',
  },
  en: {
    announcement: 'Great moments deserve a bigger audience.', announcementLink: 'Start clipping',
    discover: 'Campaigns', how: 'How it works', faq: 'FAQs', signin: 'Sign in', start: 'Get started',
    eyebrow: 'GREAT CONTENT. GREATER REACH.',
    title: 'Make clips.\nMake an impact.', subtitle: 'Brands launch campaigns. You turn the best moments into clips, share them with the world, and earn rewards for approved work.',
    browse: 'Explore campaigns', seeHow: 'See how it works', free: 'Free to join · Монгол + English',
    stageTitle: 'BIG IDEAS.\nSHORT CLIPS.', stageCaption: 'From a moment. To a movement.', source: 'The source', cut: 'Your perspective', publish: 'Post. Reach. Repeat.',
    strip: 'Your creativity. Your platforms.',
    stepsEyebrow: 'FROM THE FIRST CUT TO THE FEED', stepsTitle: 'It starts with\na great clip.',
    steps: [
      ['Find your campaign', 'Read the brief, explore the platforms, and check the budget and reward terms before you join.'],
      ['Make it your own', 'Find the moment in the approved source content and turn it into a clip with your own creative perspective.'],
      ['Post it. Submit it.', 'Publish on your channel and submit the link. Follow your review status and rewards after admin approval.'],
    ],
    campaign: 'Campaign', brief: 'A clear creative brief', platforms: 'Your chosen platforms', joined: 'Join campaign', reviewing: 'In review', approved: 'Approved',
    featureEyebrow: 'BUILT AROUND THE CREATOR', featureTitle: 'Keep creating.\nKeep track of it all.',
    features: [
      ['Clear from the start', 'See the rate, budget, and creative requirements before you join.'],
      ['Every clip, in view', 'Your submissions, review status, and feedback, together in one place.'],
      ['On your channels', 'TikTok, Instagram, or YouTube — use the platforms accepted by each campaign.'],
      ['Two languages. One space.', 'Switch between Mongolian and English whenever you need.'],
    ],
    faqTitle: 'Before the first cut',
    questions: [
      ['What is a clipper?', 'A creator who turns interesting moments from source content into short videos and publishes them on their own social channels. Always follow the source permissions and rules in each campaign.'],
      ['How do I join?', 'Sign in with your FiveGen account, complete your creator profile, and read the brief of an open campaign. Then join when you find a good fit.'],
      ['How are rewards calculated?', 'Depending on the campaign, rewards are calculated per 1,000 verified views or per approved post. The campaign page shows the rate, payout limits, and total budget.'],
      ['What happens after I submit?', 'An admin reviews your post link, content, requirements, and views. You can track the status, feedback, and approved reward in your workspace. Check the campaign brief for its payment arrangements.'],
      ['Does it cost anything to join?', 'Registering as a clipper and browsing open campaigns is free. Read the full terms of each campaign before joining.'],
    ],
    ctaEyebrow: 'THE NEXT GREAT CLIP COULD BE YOURS.', ctaTitle: 'Your perspective.\nA new possibility.', ctaText: 'Find a campaign and make your first cut.',
    admin: 'Admin', privacy: 'Privacy', terms: 'Terms', footer: 'Good moments. Bigger audiences.', rights: 'All rights reserved.',
  },
};

function Brand() {
  return <span className="clipper-lp-brand"><span className="clipper-lp-brand-symbol" aria-hidden="true"><Scissors size={24} strokeWidth={2.1} /></span><span>FiveGen<span className="clipper-lp-brand-small">Clipper</span></span></span>;
}

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
        <div className="clipper-lp-stage" role="img" aria-label={lang === 'mn' ? 'Эх бичлэгээс өөрийн клип бүтээж, сошиалд нийтлэх бүтээлч явцын дүрслэл' : 'An illustration of turning source footage into an original clip and sharing it on social channels'}>
          <div className="clipper-lp-stage-grid" /><div className="clipper-lp-stage-top"><span><span className="clipper-lp-live-dot" />FIVEGEN CLIPPER STUDIO</span><span>01 / 03</span></div>
          <div className="clipper-lp-stage-type" aria-hidden="true">{t.stageTitle.split('\n').map(line => <span key={line}>{line}</span>)}</div>
          <div className="clipper-lp-source"><div className="clipper-lp-mini-window"><i /><i /><i /><span>source.mov</span></div><div className="clipper-lp-wave"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div><div className="clipper-lp-source-bottom"><span><CirclePlay size={15} />{t.source}</span><span>00:42</span></div></div>
          <div className="clipper-lp-clip"><div className="clipper-lp-clip-top"><Scissors size={16} /><span>9:16</span></div><div className="clipper-lp-clip-orbit" /><Sparkles className="clipper-lp-clip-star" size={54} strokeWidth={1.3} /><div className="clipper-lp-clip-title">MAKE<br />THE<br /><em>CUT.</em></div><div className="clipper-lp-clip-bottom"><span>{t.cut}</span><ArrowRight size={19} /></div></div>
          <div className="clipper-lp-share"><div><span className="clipper-lp-share-icon"><Check size={19} /></span><strong>{t.publish}</strong></div><span className="clipper-lp-share-line" /><div className="clipper-lp-social-row"><span>♪</span><Instagram size={22} /><Youtube size={25} /><ArrowUpIllustration /></div></div>
          <div className="clipper-lp-timeline"><span>00:00</span><div className="clipper-lp-timeline-tracks"><i /><i /><i /><i /><i /><i /><i /></div><span>00:30</span><span className="clipper-lp-timeline-playhead" /></div>
          <div className="clipper-lp-stage-bottom"><span>{t.stageCaption}</span><span><Scissors size={14} /> CUT. CREATE. CONNECT.</span></div>
        </div>
      </section>
      <div className="clipper-lp-platforms"><span>{t.strip}</span><strong><span className="clipper-lp-tiktok">♪</span>TikTok</strong><strong><Instagram size={22} />Instagram</strong><strong><Youtube size={25} />YouTube</strong></div>
      <section className="clipper-lp-section clipper-lp-how" id="how-it-works">
        <div className="clipper-lp-section-heading"><span className="clipper-lp-eyebrow">{t.stepsEyebrow}</span><h2>{t.stepsTitle}</h2><ArrowDown className="clipper-lp-section-arrow" size={27} strokeWidth={1.5} /></div>
        <div className="clipper-lp-steps">{t.steps.map(([title, description], i) => <article className="clipper-lp-step" key={title}>
          <div className={`clipper-lp-step-visual clipper-lp-step-visual-${i + 1}`} aria-hidden="true">
            {i === 0 ? <div className="clipper-lp-brief-card"><span className="clipper-lp-brief-label"><span />{t.campaign}</span><div className="clipper-lp-brief-brand"><Scissors size={22} /><strong>{t.brief}</strong></div><div className="clipper-lp-brief-lines"><i /><i /></div><div className="clipper-lp-brief-platforms"><span>♪ TikTok</span><span><Instagram size={11} /> Instagram</span></div><div className="clipper-lp-brief-join">{t.joined}<ArrowRight size={12} /></div></div> : i === 1 ? <div className="clipper-lp-cuts"><div>THE<br />MOMENT<span>00:08</span></div><div><Scissors size={22} />YOUR<br /><em>CUT.</em><span>00:15</span></div><div>THE<br />FEED<span>00:30</span></div></div> : <div className="clipper-lp-review-card"><div><span className="clipper-lp-review-thumb"><Clapperboard size={22} /></span><div><strong>my-first-clip.mp4</strong><small>00:30 · 9:16</small></div></div><div className="clipper-lp-review-status"><Clock3 size={15} />{t.reviewing}<span /></div><div className="clipper-lp-approved"><Check size={15} />{t.approved}</div></div>}
          </div><div className="clipper-lp-step-copy"><span className="clipper-lp-step-number">0{i + 1}</span><h3>{title}</h3><p>{description}</p></div>
        </article>)}</div>
      </section>
      <section className="clipper-lp-section clipper-lp-features"><div className="clipper-lp-feature-heading"><span className="clipper-lp-eyebrow">{t.featureEyebrow}</span><h2>{t.featureTitle}</h2><a className="clipper-lp-text-link" href={workspace}>{t.browse}<ArrowRight size={18} /></a></div><div className="clipper-lp-feature-grid">{t.features.map(([title, description], i) => { const Icon = icons[i]; return <article key={title}><span className="clipper-lp-feature-icon"><Icon size={23} strokeWidth={1.6} /></span><h3>{title}</h3><p>{description}</p></article>; })}</div></section>
      <section className="clipper-lp-section clipper-lp-faq" id="clipper-faq"><div><span className="clipper-lp-eyebrow">FAQ</span><h2>{t.faqTitle}</h2></div><div>{t.questions.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={19} /></summary><p>{answer}</p></details>)}</div></section>
      <section className="clipper-lp-final"><div className="clipper-lp-final-inner"><span className="clipper-lp-eyebrow">{t.ctaEyebrow}</span><h2>{t.ctaTitle}</h2><p>{t.ctaText}</p><a className="clipper-lp-button" href={workspace}>{t.start}<ArrowRight size={18} /></a></div><span className="clipper-lp-final-scissors" aria-hidden="true"><Scissors /></span></section>
    </main>
    <footer className="clipper-lp-footer"><div className="clipper-lp-footer-top"><a href={lang === 'en' ? '?lang=en' : '?lang=mn'} aria-label="FiveGen Clipper"><Brand /></a><p>{t.footer}</p><a href={workspace}>{t.discover}<ArrowRight size={15} /></a></div><div className="clipper-lp-footer-bottom"><span>© {new Date().getUTCFullYear()} FiveGen. {t.rights}</span><nav aria-label={lang === 'mn' ? 'Нэмэлт холбоос' : 'Footer navigation'}><a href={`${appOrigin}/clipper/admin?lang=${lang}`}>{t.admin}</a><a href={`${appOrigin}/privacy`}>{t.privacy}</a><a href={`${appOrigin}/terms`}>{t.terms}</a></nav></div></footer>
  </div>;
}

function ArrowUpIllustration() { return <span className="clipper-lp-share-up"><TrendingUp size={22} /></span>; }

function Instagram({ size = 22 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.8" r=".8" fill="currentColor" stroke="none" /></svg>; }
function Youtube({ size = 25 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 26 22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="2" y="4" width="22" height="14" rx="4" /><path d="m11 8 6 3-6 3V8Z" fill="currentColor" stroke="none" /></svg>; }
