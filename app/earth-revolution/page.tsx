import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "地球革命 | 402v",
  description:
    "A science fiction novel project about Earth becoming a shared political identity under interstellar colonial pressure.",
};

const worldSignals = [
  ["Civilization pressure", "泽鲁 / Lurra 文明"],
  ["Planet status", "半殖民地半封建星球"],
  ["Core mechanism", "信息殖民"],
  ["Opening case", "月球上的谋杀案"],
];

const storyVectors = [
  {
    title: "地球身份",
    body: "故事的真正主线不是单一国家的胜负，而是地球人在外部秩序压力下第一次被迫把自己理解为同一种政治主体。",
  },
  {
    title: "信息圈养",
    body: "泽鲁 AI 镜像真实星际世界，裁剪金融、政治与文化信息，让地球以为自己进入了星际系统。",
  },
  {
    title: "科技殖民",
    body: "微核设备、量子通道、星际信用货币等技术被包装为产品进入地球，但关键知识与解释权仍留在殖民者手中。",
  },
];

const projectStatus = [
  "第一部：月球上的谋杀案",
  "已有章节草稿与章节大纲入口",
  "已有世界设计、外星生命形式、Olimpo 星际联盟与星球自毁理论分支",
  "当前重点：把民国时期中国的半殖民地半封建结构转译成银河系文明秩序",
];

export default function EarthRevolutionPage() {
  return (
    <article className="earth-page">
      <section className="earth-hero">
        <div className="earth-hero-copy">
          <p className="eyebrow">Novel project</p>
          <h1>地球革命</h1>
          <p className="earth-lede">
            未来地球在泽鲁 / Lurra 文明的信息殖民、科技殖民与星际秩序压力下，
            从一个被瓜分、被解释、被圈养的星球，逐渐生成“地球人”的共同身份。
          </p>
          <div className="earth-actions">
            <a className="button-primary" href="#project-status">
              Project status
            </a>
            <a className="button-secondary" href="/products">
              Back to Products
            </a>
          </div>
        </div>

        <div className="earth-visual" aria-label="Earth Revolution timeline artifact">
          <Image
            src="/earth-revolution/timeline.png"
            alt="地球革命故事时间线设定资料"
            width={1680}
            height={1120}
            priority
          />
        </div>
      </section>

      <section className="earth-signal-band" aria-label="World signals">
        {worldSignals.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <section className="earth-section earth-two-column">
        <div>
          <p className="eyebrow">Premise</p>
          <h2>半殖民地半封建星球</h2>
        </div>
        <p>
          这部小说用科幻结构重写民国时期的世界处境：地球接近星际通信，却尚未掌握大规模星际旅行；
          外部文明打开贸易、技术与信息通道，同时保留真正的秩序入口。地球的革命因此不是单纯反侵略，
          而是争夺现实解释权。
        </p>
      </section>

      <section className="earth-vector-grid" aria-label="Story vectors">
        {storyVectors.map((vector) => (
          <section key={vector.title} className="earth-vector">
            <h2>{vector.title}</h2>
            <p>{vector.body}</p>
          </section>
        ))}
      </section>

      <section id="project-status" className="earth-section earth-status">
        <div>
          <p className="eyebrow">Current state</p>
          <h2>初步情况</h2>
        </div>
        <ul>
          {projectStatus.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
