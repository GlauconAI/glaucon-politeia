const lessons = [
  {
    title: "第31课｜情非得已",
    focus: "扫弦中的拍弦",
    progress: "已完成 v02 正式版双视频合成：上 chord，下 melody，两路吉他混音，3:27。",
    courseUrl:
      "https://www.bilibili.com/video/BV1L3Ee6BE9m/?spm_id_from=333.1365.list.card_archive.click&vd_source=934e77c8d9520d461edccfab93dab013",
    videoLabel: "第31课作业视频",
    videoUrl: "https://gofile.me/7SLxt/3CGX48f02",
  },
  {
    title: "第30课｜迟到",
    focus: "扫弦切音、勾弦、降B和弦",
    progress: "已完成 v01 双视频合成：左侧 chord，右侧 melody，同步后合成。",
    courseUrl: "https://b23.tv/5MlgUAE",
    videoLabel: "第30课作业视频",
    videoUrl: "https://gofile.me/7SLxt/NDIrujYJk",
  },
];

export function LaoyaoGuitarFeature() {
  return (
    <section className="family-guitar-feature" aria-labelledby="laoyao-guitar-title">
      <div className="family-guitar-heading">
        <p className="eyebrow">practice log</p>
        <h2 id="laoyao-guitar-title">老姚吉他</h2>
        <p>最近两期训练营进展和录制作业入口。</p>
      </div>
      <div className="family-guitar-lessons">
        {lessons.map((lesson) => (
          <article className="family-guitar-lesson" key={lesson.title}>
            <div>
              <span className="content-pill">{lesson.focus}</span>
              <h3>{lesson.title}</h3>
              <p>{lesson.progress}</p>
            </div>
            <div className="family-guitar-actions">
              <a href={lesson.videoUrl} rel="noreferrer" target="_blank">
                {lesson.videoLabel}
              </a>
              <a href={lesson.courseUrl} rel="noreferrer" target="_blank">
                原课链接
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
