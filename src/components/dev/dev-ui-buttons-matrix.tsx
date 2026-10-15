import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Pill } from "@/components/ui/pill";
import { copy } from "@/lib/copy-vi";

const Lbl = ({ t }: { t: string }) => <span className="lbl">{t}</span>;

/** Mirrors global.html?state=buttons one-to-one (same classes, same one-off inline styles). */
export function DevUiButtonsMatrix() {
  const d = copy.devUi, t = copy.tags, b = copy.detail;
  return (
    <div className="demo">
      <h2>{d.primary}</h2>
      <div className="btns">
        <Button variant="white">{b.play}</Button>
        <Button variant="white" className="hover">{b.play} <Lbl t={d.hover} /></Button>
        <Button variant="white" className="focus">{b.play} <Lbl t={d.focus} /></Button>
        <Button variant="white" loading>{b.gettingLink}</Button>
        <Button variant="white" disabled>{b.noSource}</Button>
      </div>
      <h2>{d.secondary}</h2>
      <div className="btns">
        <Button>{b.info}</Button>
        <Button style={{ background: "#6d6d6e80" }}>{b.info} <Lbl t={d.hover} /></Button>
        <Button className="focus">{b.info} <Lbl t={d.focus} /></Button>
        <Button disabled>{b.info} <Lbl t={d.disabled} /></Button>
      </div>
      <h2>{d.red}</h2>
      <div className="btns">
        <Button variant="red">{copy.login.submit}</Button>
        <Button variant="red" loading style={{ color: "#fff" }}>{copy.login.submitting}</Button>
        <Button variant="red" disabled>{copy.login.submit}</Button>
      </div>
      <h2>{d.round}</h2>
      <div className="btns">
        <Button variant="round">{b.plus}</Button>
        <Button variant="round" style={{ borderColor: "#fff", background: "#fff", color: "#000" }}>{b.check}</Button>
        <Button variant="round">{b.like}</Button>
        <Button variant="round" style={{ background: "#fff", color: "#000" }}>{b.like}</Button>
      </div>
      <h2>{d.tags}</h2>
      <div className="btns">
        <Tag kind="g">{t.cached}</Tag>
        <Tag kind="x">{t.uncached}</Tag>
        <Tag kind="b">{t.direct}</Tag>
        <Tag kind="b-outline">{t.maybe}</Tag>
        <Tag kind="o">{t.app}</Tag>
        <Tag kind="blue">{t.downloading(73)}</Tag>
        <Tag kind="o">{t.queued}</Tag>
        <Tag kind="red">{t.error}</Tag>
        <Pill>{t.hd}</Pill>
        <Pill>{t.uhd}</Pill>
        <Pill>{t.age16}</Pill>
        <Pill>{t.en}</Pill>
      </div>
    </div>
  );
}
