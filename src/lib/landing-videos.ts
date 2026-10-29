// The showreel on the landing page. Edit only this list to change what plays there.
// `url` is a public file in the Supabase `vl-videos` bucket; `poster` is a still in public/landing.
const BUCKET = "https://tthoenvdikpwrgodgswq.supabase.co/storage/v1/object/public/vl-videos/3e0ea3a6-fce2-4421-b1ff-90512fe86244";

export type LandingVideo = { title: string; family: string; url: string; poster: string };

export const landingVideos: LandingVideo[] = [
  {
    title: "Weight loss does not have to be miserable",
    family: "Product UI",
    url: `${BUCKET}/3a0eaee2-8de9-425a-9987-72d66a319677.mp4?v=cutout`,
    poster: "/landing/poster-1.webp",
  },
  {
    title: "How advertising lost the plot",
    family: "Explainer",
    url: `${BUCKET}/865ce51e-c9a5-4235-a852-5f7d61774cde.mp4?v=cutout`,
    poster: "/landing/poster-2.webp",
  },
  {
    title: "How we cut our meetings in half",
    family: "Kinetic typography",
    url: `${BUCKET}/4efda9b1-abc6-4a16-8059-89dac08d1a29.mp4?v=cutout`,
    poster: "/landing/poster-3.webp",
  },
  {
    title: "The cab that arrived late",
    family: "Generative",
    url: `${BUCKET}/d2531ce0-5273-4a08-9645-0a9832b64e5e.mp4?v=cutout`,
    poster: "/landing/poster-4.webp",
  },
];
