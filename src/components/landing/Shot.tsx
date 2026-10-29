// A real screenshot of the app in light and dark. CSS shows the one that matches the viewer's appearance.
type Props = { name: string; alt: string; w: number; h: number; eager?: boolean };

export default function Shot({ name, alt, w, h, eager }: Props) {
  /* eslint-disable @next/next/no-img-element */
  return (
    <>
      <img
        className="lp-shot lp-img-light"
        src={`/landing/${name}-light.webp`}
        alt={alt}
        width={w}
        height={h}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        decoding="async"
      />
      <img className="lp-shot lp-img-dark" src={`/landing/${name}-dark.webp`} alt={alt} width={w} height={h} loading="lazy" decoding="async" />
    </>
  );
}
