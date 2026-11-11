// app/layout.tsx
export const metadata = {
  title: 'Caju Finance 🥭 | Seu Assistente Financeiro',
  description: 'Controle financeiro inteligente do casal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <script src="https://cdn.tailwindcss.com"></script>
        <style>{`
          /* Estilização global de Scrollbar (Chrome, Edge, Safari) */
          ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
          ::-webkit-scrollbar-track {
            background: rgba(15, 23, 42, 0.6);
            border-radius: 9999px;
          }
          ::-webkit-scrollbar-thumb {
            background: #334155;
            border-radius: 9999px;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: #10b981; /* Fica verde esmeralda ao passar o mouse */
          }

          /* Firefox */
          * {
            scrollbar-width: thin;
            scrollbar-color: #334155 rgba(15, 23, 42, 0.6);
          }

          /* Esconder barra no menu mobile mantendo o scroll */
          .hide-scrollbar::-webkit-scrollbar {
            display: none;
          }
          .hide-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}</style>
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-emerald-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}