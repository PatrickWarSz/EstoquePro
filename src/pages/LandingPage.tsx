import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Clock,
  LayoutGrid,
  CalendarX,
  Eye,
  Truck,
  ShieldCheck,
  Check,
  MessageCircle,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      delay: i * 0.1,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
};

function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-4">
      <nav className="flex w-full max-w-5xl items-center justify-between rounded-full border border-black/5 bg-white/60 px-5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-neutral-900 to-neutral-700" />
          <span className="text-[15px] font-semibold tracking-tight text-neutral-900">EstoquePro</span>
        </div>
        <div className="hidden items-center gap-8 text-sm text-neutral-600 md:flex">
          <a href="#problema" className="transition hover:text-neutral-900">Problema</a>
          <a href="#recursos" className="transition hover:text-neutral-900">Recursos</a>
          <a href="#preco" className="transition hover:text-neutral-900">Preço</a>
        </div>
        <Link
          to="/app/estoque"
          className="group flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          Abrir app
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </nav>
    </header>
  );
}

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0.4]);

  return (
    <section ref={ref} className="relative overflow-hidden pb-24 pt-40 md:pt-56">
      {/* Soft background orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-emerald-200/30 blur-[120px]" />
        <div className="absolute right-0 top-40 h-[400px] w-[400px] rounded-full bg-blue-200/30 blur-[100px]" />
      </div>

      <motion.div style={{ y, opacity }} className="mx-auto max-w-5xl px-6 text-center">
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/60 px-3 py-1 text-xs text-neutral-600 backdrop-blur-md"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Feito para confecções e fábricas têxteis
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="show"
          custom={1}
          variants={fadeUp}
          className="mx-auto max-w-4xl text-balance text-5xl font-semibold tracking-tight text-neutral-900 md:text-7xl"
        >
          O controle da sua confecção,{" "}
          <span className="bg-gradient-to-r from-neutral-900 via-neutral-500 to-neutral-900 bg-clip-text text-transparent">
            agora no piloto automático.
          </span>
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="show"
          custom={2}
          variants={fadeUp}
          className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600 md:text-xl"
        >
          Diga adeus ao caos das planilhas. O programa definitivo para gerir estoque e pedidos de
          matéria prima do seu negócio.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="show"
          custom={3}
          variants={fadeUp}
          className="mt-10 flex items-center justify-center gap-3"
        >
          <Link
            to="/app/estoque"
            className="group inline-flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-3 text-base font-medium text-white shadow-lg shadow-neutral-900/10 transition-all hover:scale-[1.03] hover:bg-neutral-800"
          >
            Ver o sistema na prática
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </motion.div>

      {/* Dashboard mockup */}
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto mt-20 max-w-6xl px-6"
      >
        <motion.div
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="relative rounded-3xl border border-black/5 bg-white/70 p-2 shadow-2xl shadow-neutral-900/10 backdrop-blur-md"
        >
          <div className="overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-br from-neutral-50 to-neutral-100">
            {/* Fake browser dots */}
            <div className="flex items-center gap-1.5 border-b border-black/5 bg-white/60 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
            </div>
            {/* Mock dashboard */}
            <div className="grid grid-cols-12 gap-3 p-5">
              <div className="col-span-3 hidden flex-col gap-2 md:flex">
                {["Estoque", "Pedidos", "Fornecedores", "Histórico"].map((s, i) => (
                  <div
                    key={s}
                    className={`rounded-lg px-3 py-2 text-xs ${
                      i === 0 ? "bg-neutral-900 text-white" : "bg-white/70 text-neutral-600"
                    }`}
                  >
                    {s}
                  </div>
                ))}
              </div>
              <div className="col-span-12 md:col-span-9">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { l: "Itens", v: "1.284", c: "emerald" },
                    { l: "Pedidos", v: "32", c: "blue" },
                    { l: "Crítico", v: "7", c: "amber" },
                  ].map((k) => (
                    <div key={k.l} className="rounded-xl border border-black/5 bg-white/80 p-4">
                      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                        {k.l}
                      </div>
                      <div className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
                        {k.v}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl border border-black/5 bg-white/80 p-4">
                  <div className="mb-3 h-3 w-32 rounded bg-neutral-200" />
                  {[80, 60, 92, 45, 70].map((w, i) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      <div className="h-2 rounded bg-neutral-200" style={{ width: `${w}%` }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

function Problem() {
  const items = [
    { icon: Clock, title: "Horas perdidas cruzando dados.", desc: "Planilhas, anotações e WhatsApp espalhados." },
    { icon: LayoutGrid, title: "Falta de controle de grade.", desc: "Tamanhos e cores que somem sem aviso." },
    {
      icon: CalendarX,
      title: "Pedidos no tempo errado.",
      desc: "Atrasos que custam a sazonalidade inteira.",
    },
  ];
  return (
    <section id="problema" className="relative px-6 py-32">
      <div className="mx-auto max-w-5xl">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center text-4xl font-semibold tracking-tight text-neutral-900 md:text-5xl"
        >
          Nós sabemos onde o seu dinheiro está vazando.
        </motion.h2>

        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="group rounded-2xl border border-black/5 bg-white/60 p-7 backdrop-blur-md transition hover:border-black/10 hover:bg-white"
            >
              <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-white">
                <it.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-medium tracking-tight text-neutral-900">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{it.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="recursos" className="px-6 py-32">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-sm font-medium uppercase tracking-wider text-emerald-600">Recursos</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-neutral-900 md:text-5xl">
            Tudo o que sua fábrica precisa. Nada que não precisa.
          </h2>
        </motion.div>

        <div className="mt-16 grid gap-4 md:grid-cols-6 md:grid-rows-2">
          {/* Big card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="md:col-span-4 md:row-span-2 flex min-h-[420px] flex-col justify-between rounded-3xl border border-black/5 bg-gradient-to-br from-neutral-50 to-white p-10"
          >
            <Eye className="h-7 w-7 text-emerald-600" />
            <div>
              <h3 className="text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
                Gestão Visual.
              </h3>
              <p className="mt-3 max-w-md text-base text-neutral-600">
                Cada cor, tamanho e fornecedor a um olhar. Identifique gargalos antes que virem
                problema.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="md:col-span-2 flex flex-col justify-between rounded-3xl border border-black/5 bg-neutral-900 p-8 text-white"
          >
            <Truck className="h-6 w-6 text-emerald-400" />
            <div className="mt-8">
              <h3 className="text-2xl font-semibold tracking-tight">Integração Logística.</h3>
              <p className="mt-2 text-sm text-neutral-400">
                Pedidos, chegadas e fornecedores conectados.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="md:col-span-2 flex flex-col justify-between rounded-3xl border border-black/5 bg-white p-8"
          >
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            <div className="mt-8">
              <h3 className="text-2xl font-semibold tracking-tight text-neutral-900">
                Histórico à prova de falhas.
              </h3>
              <p className="mt-2 text-sm text-neutral-600">
                Cada movimento registrado. Auditável, sempre.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const features = [
    "Itens, grades e categorias ilimitados",
    "Controle completo de pedidos",
    "Histórico e auditoria",
    "Atualizações contínuas",
  ];
  return (
    <section id="preco" className="relative px-6 py-32">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-100/40 blur-[120px]" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-3xl text-center"
      >
        <h2 className="text-4xl font-semibold tracking-tight text-neutral-900 md:text-5xl">
          Simples como deve ser.
        </h2>
        <p className="mt-4 text-lg text-neutral-600">
          Um plano. Tudo incluso. Sem surpresas.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto mt-12 max-w-md"
      >
        <div className="rounded-3xl border border-black/5 bg-white/70 p-10 shadow-2xl shadow-neutral-900/10 backdrop-blur-md">
          <div className="text-sm font-medium uppercase tracking-wider text-emerald-600">
            EstoquePro
          </div>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-5xl font-semibold tracking-tight text-neutral-900">R$ 49,90</span>
            <span className="text-base text-neutral-500">/ mês</span>
          </div>
          <ul className="mt-8 space-y-3">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-neutral-700">
                <Check className="h-4 w-4 text-emerald-600" />
                {f}
              </li>
            ))}
          </ul>
          <Link
            to="/app/estoque"
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-medium text-white transition hover:scale-[1.02] hover:bg-neutral-800"
          >
            Começar agora
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

function FooterCTA() {
  return (
    <section className="px-6 py-32">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-4xl text-center"
      >
        <h2 className="text-balance text-5xl font-semibold tracking-tight text-neutral-900 md:text-6xl">
          Pronto para modernizar sua fábrica?
        </h2>
        <a
          href="https://wa.me/?text=Quero%20saber%20mais%20sobre%20o%20EstoquePro"
          target="_blank"
          rel="noreferrer"
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-7 py-3.5 text-base font-medium text-white shadow-lg shadow-emerald-600/20 transition hover:scale-[1.03] hover:bg-emerald-700"
        >
          <MessageCircle className="h-5 w-5" />
          Falar com o Desenvolvedor no WhatsApp
        </a>
      </motion.div>
      <div className="mx-auto mt-20 flex max-w-5xl items-center justify-between border-t border-black/5 pt-8 text-xs text-neutral-500">
        <span>© {new Date().getFullYear()} EstoquePro</span>
        <span>Feito com cuidado.</span>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#fafafa] text-neutral-900 antialiased">
      <Nav />
      <Hero />
      <Problem />
      <Features />
      <Pricing />
      <FooterCTA />
    </div>
  );
}