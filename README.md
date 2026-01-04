# Umay Gantt Builder

A simple, elegant Gantt chart generator for project planning. Built with Nuxt 3, works entirely in the browser with no backend required.

![Umay Gantt Builder](https://img.shields.io/badge/Nuxt-3.x-00DC82?style=flat-square&logo=nuxt.js)
![Vue](https://img.shields.io/badge/Vue-3.x-4FC08D?style=flat-square&logo=vue.js)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

## Features

- 📅 **Multi-year Planning** - Plan projects spanning 1-3 years with annual/monthly views
- 🎨 **Beautiful UI** - Monochrome minimal design with soft color palette for tasks
- 📦 **Multiple Projects** - Manage multiple projects in one place
- 🔗 **Task Dependencies** - Visual dependency lines between tasks
- 📁 **Subtasks** - Hierarchical task structure with parent-child relationships
- 🔍 **Zoom Control** - Zoom in/out to adjust timeline width
- 💾 **Local Storage** - All data stored locally in browser
- 📤 **Export Options** - Export to JSON or Mermaid diagram syntax
- 🔗 **URL Sharing** - Share projects via compressed URL (no server needed)
- 🖱️ **Drag & Drop** - Move and resize tasks directly on the chart
- 📱 **Static Generation** - Works as a static site, deploy anywhere

## Quick Start

### Prerequisites

- Node.js 18+
- Yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/gantt.git
cd gantt

# Install dependencies
yarn install

# Start development server
yarn dev
```

### Build for Production

```bash
# Generate static files
yarn generate

# Preview production build
yarn preview
```

## Usage

### Creating a Project

1. Click the **"+"** button in the sidebar
2. Enter project name and select a color
3. Click **"Oluştur"** (Create)

### Adding Tasks

1. Click the **"+"** button in the task list header
2. Double-click a task to edit details
3. Drag tasks horizontally to change dates
4. Drag task edges to resize duration

### Adding Subtasks

1. Hover over a task and click the **"+"** button
2. Subtasks automatically start 2 days after parent task

### Setting Dependencies

1. Open task details modal
2. Select dependent tasks from the dropdown
3. Dependencies are shown as orange connection lines

### Sharing Projects

1. Click **"Dışa Aktar"** (Export) in the sidebar
2. Click **"Paylaşım Linki Oluştur"** (Create Share Link)
3. Copy the generated URL
4. Recipients can open the URL to import the project

## Tech Stack

- **Framework**: Nuxt 3 (SSG mode)
- **UI**: Vue 3 + TailwindCSS
- **State**: Pinia
- **Storage**: LocalStorage
- **Icons**: Nuxt Icon (Phosphor Icons)
- **Compression**: LZ-String (for URL sharing)

## Project Structure

```
app/
├── components/
│   ├── GanttChart.vue      # Main chart component
│   ├── GanttRow.vue        # Task row (list & chart modes)
│   ├── GanttBar.vue        # Draggable task bar
│   ├── DependencyLines.vue # Connection lines
│   ├── TaskModal.vue       # Task edit modal
│   ├── ProjectModal.vue    # Project edit modal
│   └── ImportExportModal.vue
├── composables/
│   ├── useDatabase.ts      # LocalStorage operations
│   └── useExport.ts        # Export/import utilities
├── stores/
│   └── gantt.ts            # Pinia store
├── types/
│   └── index.ts            # TypeScript types
└── utils/
    ├── dates.ts            # Date utilities
    └── mermaid.ts          # Mermaid conversion
```

## License

MIT License - feel free to use for personal and commercial projects.

---

# Umay Gantt Builder (Türkçe)

Proje planlaması için basit ve şık bir Gantt şeması oluşturucu. Nuxt 3 ile geliştirilmiş, backend gerektirmeden tamamen tarayıcıda çalışır.

## Özellikler

- 📅 **Çok Yıllık Planlama** - 1-3 yıl kapsayan projeler için yıllık/aylık görünümler
- 🎨 **Güzel Arayüz** - Görevler için soft renk paletiyle monokrom minimal tasarım
- 📦 **Çoklu Proje** - Birden fazla projeyi tek yerde yönetin
- 🔗 **Görev Bağımlılıkları** - Görevler arası görsel bağımlılık çizgileri
- 📁 **Alt Görevler** - Hiyerarşik görev yapısı
- 🔍 **Yakınlaştırma** - Timeline genişliğini ayarlamak için zoom kontrolü
- 💾 **Yerel Depolama** - Tüm veriler tarayıcıda saklanır
- 📤 **Dışa Aktarma** - JSON veya Mermaid diagram formatına aktarım
- 🔗 **URL ile Paylaşım** - Sıkıştırılmış URL ile proje paylaşımı (sunucu gerektirmez)
- 🖱️ **Sürükle & Bırak** - Görevleri doğrudan şema üzerinde taşıyın ve boyutlandırın
- 📱 **Statik Üretim** - Statik site olarak çalışır, her yere deploy edilebilir

## Hızlı Başlangıç

### Gereksinimler

- Node.js 18+
- Yarn

### Kurulum

```bash
# Repoyu klonlayın
git clone https://github.com/your-username/gantt.git
cd gantt

# Bağımlılıkları yükleyin
yarn install

# Geliştirme sunucusunu başlatın
yarn dev
```

### Production için Build

```bash
# Statik dosyaları oluşturun
yarn generate

# Production build'i önizleyin
yarn preview
```

## Kullanım

### Proje Oluşturma

1. Yan paneldeki **"+"** butonuna tıklayın
2. Proje adını girin ve renk seçin
3. **"Oluştur"** butonuna tıklayın

### Görev Ekleme

1. Görev listesi başlığındaki **"+"** butonuna tıklayın
2. Detayları düzenlemek için göreve çift tıklayın
3. Tarihleri değiştirmek için görevleri yatay olarak sürükleyin
4. Süreyi değiştirmek için görev kenarlarını sürükleyin

### Alt Görev Ekleme

1. Bir görevin üzerine gelin ve **"+"** butonuna tıklayın
2. Alt görevler otomatik olarak üst görevden 2 gün sonra başlar

### Bağımlılık Ayarlama

1. Görev detay modalını açın
2. Açılır listeden bağımlı görevleri seçin
3. Bağımlılıklar turuncu bağlantı çizgileri olarak gösterilir

### Proje Paylaşımı

1. Yan panelde **"Dışa Aktar"** butonuna tıklayın
2. **"Paylaşım Linki Oluştur"** butonuna tıklayın
3. Oluşturulan URL'yi kopyalayın
4. Alıcılar URL'yi açarak projeyi içe aktarabilir

## Teknoloji Yığını

- **Framework**: Nuxt 3 (SSG modu)
- **UI**: Vue 3 + TailwindCSS
- **State**: Pinia
- **Depolama**: LocalStorage
- **İkonlar**: Nuxt Icon (Phosphor Icons)
- **Sıkıştırma**: LZ-String (URL paylaşımı için)

## Proje Yapısı

```
app/
├── components/
│   ├── GanttChart.vue      # Ana şema bileşeni
│   ├── GanttRow.vue        # Görev satırı (liste & şema modları)
│   ├── GanttBar.vue        # Sürüklenebilir görev çubuğu
│   ├── DependencyLines.vue # Bağlantı çizgileri
│   ├── TaskModal.vue       # Görev düzenleme modalı
│   ├── ProjectModal.vue    # Proje düzenleme modalı
│   └── ImportExportModal.vue
├── composables/
│   ├── useDatabase.ts      # LocalStorage işlemleri
│   └── useExport.ts        # Dışa/içe aktarma yardımcıları
├── stores/
│   └── gantt.ts            # Pinia store
├── types/
│   └── index.ts            # TypeScript tipleri
└── utils/
    ├── dates.ts            # Tarih yardımcıları
    └── mermaid.ts          # Mermaid dönüştürme
```

## Lisans

MIT Lisansı - kişisel ve ticari projelerde özgürce kullanabilirsiniz.
