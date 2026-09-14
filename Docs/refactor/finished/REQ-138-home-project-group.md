# REQ-138 — Home as a project for unfiled sessions

- **Durum:** done
- **Tarih:** 2026-09-14
- **İstek (kullanıcı):** "abi bu herhangi bir projeye bağlı olmayan sessionlar da home olarak yer alsın. home da bir proje gibi gözüksün o en üstte olsun default olarak." (ekran görüntüsü: sidebar'da başlıksız "Untitled session" satırları TODAY / YESTERDAY / EARLIER gruplarına dağılmış)
- **Dosyalar:** `packages/lokma-web/web/src/components/sessions/grouping.ts`, `.../sessions-sidebar.tsx`, `.../index.ts`, `.../sessions.test.ts`, `scripts/probe-home-project.cjs`

## Belirti

Bir proje kaydına bağlı olmayan her session (cwd'siz, ya da cwd'si hiçbir projeye denk gelmeyen) tarih gruplarının içine karışıyordu ve "By project" görünümünde `default` adlı isimsiz bir kovaya düşüyordu. Sidebar'ın Projects bölümü ise yalnızca `projects.length > 0` iken render ediliyordu: hiç proje kaydı olmayan bir kurulumda bölüm hiç görünmüyor, dolayısıyla "her şeyin toplandığı" bir giriş noktası olmuyordu.

## Fix

- **`HOME_PROJECT` sanal projesi:** `projectOf` artık cwd'siz / `~` olan session için `'default'` değil `'Home'` döner. `groupSessions(..., 'project')` sıralamasında Home **en üste sabitlenir** (eskiden oturum sayısına göre sıralanıyordu).
- **`splitByProjects(sessions, projectCwds)`:** sessionları `home` / `inProjects` diye ikiye ayırır. Home bölümü projesizleri alır, alt listeler yalnızca projeli olanları — böylece **hiçbir session iki kez çizilmez**.
  - Tuzak: `sameCwd('', '')` tasarım gereği `true` döner. cwd'siz bir proje kaydı filtrelenmezse **tüm** cwd'siz sessionları yutar; bu yüzden boş cwd'ler eşleştirmeden önce atılır (testle kilitlendi).
- **Sidebar:** Projects bölümü artık koşulsuz render edilir ve ilk satırı Home'dur — gerçek projelerle **aynı `ProjectGroup` bileşeni**, Lucide `House` ikonu ve oturum rozetiyle. Home varsayılan olarak **açık** gelir (`expandedProjects` başlangıcı ve query/groupBy değişiminde kalan tek açık grup), "New session here" cwd'siz session açar (yani yine Home'a düşer).
- **Home bir kayıt değil:** menüsünde "Copy project path" ve "Delete all sessions" yoktur (o aksiyonlar `cwd` / `onDeleteProject` yokluğunda render edilmez); silinecek bir kaydı yoktur.
- **Empty-state:** "No sessions yet" artık Home ve projeli liste **ikisi de** boşken çıkar.

## Kanıt

- `scripts/probe-home-project.cjs` (kalıcı canlı prob) — `https://lokma.fermag.com.tr` üzerinde **6/6 PASS**: Home bir grup olarak render ediliyor (`Home+(168)`), açık, ev ikonlu, rozet 168 ve 168 satır çiziliyor, hiçbir grubun altında değil, hiçbir session iki kez görünmüyor. Örnek satırlar: `Untitled session`.
- `bun src/components/sessions/sessions.test.ts` → **45 passed, 0 failed** (yeni: 7 `splitByProjects` vakası + Home etiketi + Home en üstte sıralaması).
- Kapılar: `bun x tsc --noEmit` 0 hata · `bun run build` green.

## Kapsam notu

Home gerçek bir proje kaydı değildir: diske yazılmaz, silinemez, cwd'si yoktur. Yalnızca "hiçbir projeye bağlı olmayan sessionlar" için sabit bir giriş noktasıdır. Bir session'a proje atamak yine proje kaydı oluşturmakla olur; o an ilgili session Home'dan çıkıp kendi projesine taşınır.
