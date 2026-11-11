// Static marketing content and category artwork. Product data comes from the API.
export const slides = [
  {
    id: 1,
    left: "/images/firstSlideLeft.png",
    right: "/images/firstSlideRight.png",
    eyebrow: "Welcome to",
    title: "The Bohemian Paradise",
    desc: "Original paintings and limited prints, made by hand in New Delhi.",
    cta: "Shop the collection",
    to: "/products",
  },
  {
    id: 2,
    left: "/images/flower.png",
    right: "",
    eyebrow: "",
    title: "Our Collection",
    desc: "Nature, zodiac, seascapes, portraits and more. Every original is one of a kind, so when it's gone, it's gone.",
    cta: "Explore",
    to: "/products",
  },
  {
    id: 3,
    left: "/images/momlovey.png",
    right: "/images/firstSlideRight.png",
    eyebrow: "",
    title: "The Artist",
    desc: "Painted with love by a mother, brought online by her son.",
    cta: "See what's new",
    to: "/products?sort=newest",
  },
];

export const categoryArt = {
  zodiac: { title: "Zodiac", img: "/images/Categories/zodiac.jpg" },
  valentine: { title: "Valentines", img: "/images/Categories/valentine.jpg" },
  fruits: { title: "Fruits", img: "/images/Categories/fruits.jpg" },
  wildlife: { title: "Wildlife", img: "/images/Categories/animals.jpg" },
  nature: { title: "Nature", img: "/images/Categories/nature.jpg" },
  potraits: { title: "Portraits", img: "/images/Categories/potraits.jpg" },
  portraits: { title: "Portraits", img: "/images/Categories/potraits.jpg" },
  monochrome: { title: "Monochrome", img: "/images/Categories/monochromes.jpg" },
  abstract: { title: "Abstract", img: "/images/Categories/abstract.jpg" },
  seascapes: { title: "Seascapes", img: "/images/Categories/seascapes.jpg" },
  seascape: { title: "Seascapes", img: "/images/Categories/seascapes.jpg" },
  attractions: { title: "Attractions", img: "/images/Categories/attractions.jpg" },
};

export const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

export const contact = {
  location: "Pitampura, New Delhi",
  phone: "+91 94576 61493",
  email: "agarwal.udit1999@gmail.com",
  instagram: "https://www.instagram.com/",
};
