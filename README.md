# Finanzas App

Web App de gestión de ingresos y egresos personales.

## Stack

- **Framework**: Next.js 16 (App Router)
- **Base de Datos & Auth**: Supabase (PostgreSQL, Auth, RLS)
- **Estilos**: Tailwind CSS v4 + componentes estilo Shadcn/UI
- **Iconos**: Lucide React
- **Gráficos**: Recharts
- **Exportación**: jsPDF, xlsx, CSV nativo
- **Hosting**: Vercel

## Setup Inicial

### 1. Crear proyecto en Supabase

1. Ir a [supabase.com](https://supabase.com) y crear un nuevo proyecto.
2. En **SQL Editor**, ejecutar el contenido de `supabase/schema.sql`.
3. En **Project Settings → API**, copiar:
   - `Project URL`
   - `anon public key`

### 2. Configurar variables de entorno

Editar el archivo `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

### 3. Configurar Auth en Supabase

En el panel de Supabase, ir a **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` (desarrollo) o tu dominio de producción
- **Redirect URLs**: 
  - `http://localhost:3000/**`
  - `https://tu-dominio.vercel.app/**`

### 4. Instalar y ejecutar

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## Deploy en Vercel

1. Importar el repositorio en [vercel.com](https://vercel.com)
2. Agregar las variables de entorno en el panel de Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy!

## Estructura del Proyecto

```
finanzas-app/
├── app/
│   ├── (auth)/              # Login, Register, Forgot Password
│   ├── (dashboard)/         # Área autenticada
│   │   ├── dashboard/       # Dashboard principal
│   │   ├── transactions/    # CRUD de movimientos
│   │   ├── accounts/        # Gestión de cuentas
│   │   ├── categories/      # Categorías
│   │   ├── tags/            # Etiquetas
│   │   └── reports/         # Reportes y gráficos
│   └── actions/             # Server Actions
├── components/
│   ├── ui/                  # Componentes base (Button, Card, Dialog...)
│   ├── dashboard/           # Dashboard, Header, Sidebar, Reports
│   ├── accounts/            # Gestión de cuentas
│   ├── categories/          # Categorías y etiquetas
│   └── transactions/        # Formularios de movimientos
├── lib/
│   ├── supabase/            # Cliente Supabase (browser/server)
│   ├── types.ts             # Tipos TypeScript
│   ├── utils.ts             # Utilidades (formatCurrency, etc.)
│   └── export.ts            # Exportación PDF, Excel, CSV
├── hooks/
│   └── use-toast.ts         # Hook de notificaciones
├── middleware.ts             # Auth middleware
└── supabase/
    └── schema.sql           # Schema de la base de datos
```

## Funcionalidades

- ✅ Autenticación completa (registro, login, recuperación de contraseña)
- ✅ Validación de email (link de confirmación)
- ✅ Dashboard con gráfico de dona y lista de movimientos agrupada por día
- ✅ CRUD de Cuentas (con monedas: ARS, USD, EUR, etc.)
- ✅ CRUD de Categorías con etiquetas dinámicas (creación al vuelo)
- ✅ CRUD de Etiquetas independiente
- ✅ Alerta de baja de categorías con movimientos en el último año
- ✅ Registro de Ingresos, Gastos y Transferencias
- ✅ Filtros multivariable (tipo, período, cuenta, categoría, etiquetas)
- ✅ Exportación a PDF, Excel y CSV
- ✅ Dark/Light Mode
- ✅ 100% Responsive (Mobile First)
- ✅ Row Level Security (datos privados por usuario)
