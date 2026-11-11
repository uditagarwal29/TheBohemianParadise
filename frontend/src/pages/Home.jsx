import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { slides, categoryArt, titleCase } from "../data";
import ProductCard from "../components/ProductCard";
import { Icon } from "../components/Layout";

function Hero() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 7000);
    return () => clearInterval(t);
  }, []);
  const go = (d) => setI((x) => (x + d + slides.length) % slides.length);
  return (
    <section className="hero" aria-roledescription="carousel">
      <button className="hero__arrow hero__arrow--left" onClick={() => go(-1)} aria-label="Previous"><Icon.chevron style={{ transform: "rotate(180deg)" }} /></button>
      <div className="hero__track" style={{ transform: `translateX(-${i * 100}%)` }}>
        {slides.map((s) => (
          <div className="hero__slide" key={s.id} aria-hidden={slides[i].id !== s.id}>
            {s.left ? <img className="hero__img hero__img--left" src={s.left} alt="" /> : <div />}
            <div className="hero__info">
              {s.eyebrow && <span className="hero__eyebrow">{s.eyebrow}</span>}
              <h1 className="hero__title">{s.title}</h1>
              <p className="hero__desc">{s.desc}</p>
              <Link to={s.to} className="btn btn--primary btn--pill">{s.cta}</Link>
            </div>
            {s.right ? <img className="hero__img hero__img--right" src={s.right} alt="" /> : <div />}
          </div>
        ))}
      </div>
      <button className="hero__arrow hero__arrow--right" onClick={() => go(1)} aria-label="Next"><Icon.chevron /></button>
      <div className="hero__dots">{slides.map((s, k) => <button key={s.id} className={k === i ? "is-active" : ""} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} />)}</div>
    </section>
  );
}

export default function Home() {
  const [featured, setFeatured] = useState(null);
  const [cats, setCats] = useState([]);

  useEffect(() => {
    api.products.list({ limit: 8, sort: "newest", inStock: 1 }).then((r) => setFeatured(r.items)).catch(() => setFeatured([]));
    api.products.categories().then(setCats).catch(() => setCats([]));
  }, []);

  const catCards = (cats.length ? cats.map((c) => c.name) : Object.keys(categoryArt).slice(0, 8)).map((name) => ({
    name,
    title: categoryArt[name]?.title || titleCase(name),
    img: categoryArt[name]?.img,
    count: cats.find((c) => c.name === name)?.count,
  }));

  return (
    <>
      <Hero />

      <section className="section">
        <div className="section__head">
          <h2>Available now</h2>
          <Link to="/products?inStock=1">View all</Link>
        </div>
        {featured === null ? (
          <div className="grid grid--products">{Array.from({ length: 4 }).map((_, k) => <div className="card card--skeleton" key={k} />)}</div>
        ) : featured.length === 0 ? (
          <p className="muted">New pieces are on the way. Check back soon.</p>
        ) : (
          <div className="grid grid--products">{featured.map((p) => <ProductCard key={p._id} product={p} />)}</div>
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Browse by theme</h2>
        </div>
        <div className="grid grid--cats">
          {catCards.map((c) => (
            <Link to={`/products/${c.name}`} className="cat" key={c.name} style={c.img ? { backgroundImage: `url(${c.img})` } : undefined}>
              <span className="cat__title">{c.title}</span>
              {c.count !== undefined && <span className="cat__count">{c.count} {c.count === 1 ? "piece" : "pieces"}</span>}
            </Link>
          ))}
        </div>
      </section>

      <section className="commission">
        <h2>Want an artwork of your choice?</h2>
        <p>Commissions are open. Send a note with the theme, size and occasion, and the artist will get back to you.</p>
        <a className="btn btn--primary btn--pill" href="mailto:agarwal.udit1999@gmail.com?subject=Commission%20request">Request a commission</a>
      </section>
    </>
  );
}
