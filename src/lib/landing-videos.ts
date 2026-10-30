// The showreel on the landing page. Edit only this list to change what plays there.
// `url` is a public file in the Supabase `vl-videos` bucket; `poster` is a still in public/landing.
const BUCKET = "https://tthoenvdikpwrgodgswq.supabase.co/storage/v1/object/public/vl-videos";

export type LandingVideo = { title: string; family: string; url: string; poster: string };

export const landingVideos: LandingVideo[] = [
  {
    title: "Weight loss does not have to be miserable",
    family: "Kinetic type",
    url: `${BUCKET}/3e0ea3a6-fce2-4421-b1ff-90512fe86244/86b0344a-3558-4640-9fba-4e9dd516f3fd.mp4`,
    poster: "/landing/poster-1.webp",
  },
  {
    title: "How advertising lost the plot",
    family: "Editorial",
    url: `${BUCKET}/3e0ea3a6-fce2-4421-b1ff-90512fe86244/e9c0df1e-52f8-414b-9373-3c0744801b27.mp4`,
    poster: "/landing/poster-2.webp",
  },
  {
    title: "How we cut our meetings in half",
    family: "Product UI",
    url: `${BUCKET}/3e0ea3a6-fce2-4421-b1ff-90512fe86244/4d465cf3-3fdd-4aef-9705-e7c185828714.mp4`,
    poster: "/landing/poster-3.webp",
  },
  {
    title: "The cab that arrived late",
    family: "Boardroom",
    url: `${BUCKET}/3e0ea3a6-fce2-4421-b1ff-90512fe86244/97c726c1-81f2-418d-8e83-d74fcf9e0017.mp4`,
    poster: "/landing/poster-4.webp",
  },
];
