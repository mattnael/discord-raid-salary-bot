# ⚔️ Discord Raid & Salary Bot

Bot Discord untuk manajemen rekrutmen party raid (Dragon Nest / MMORPG) dan kalkulasi pembagian gaji (*salary distribution*) otomatis dengan pencatatan database SQLite.

---

## ✨ Fitur Utama

* **Party Recruitment System (`/createparty`)**
  * 8 Party Member dengan Job yang fleksibel (Force User, Healer, Mercenary, Swordmaster, Tank, Ice Stack, Acrobat, DPS)[cite: 2].
  * Pemilihan *sub-class* / job spesifik untuk slot DPS via Dropdown & Modal teks[cite: 2].
  * Buat room obrolan berupa thread koordinasi langsung dari panel rekrutmen[cite: 2].
  * Manajemen Host: Kunci/Buka party (*Lock/Unlock*), tambah member manual, kick member, atau batalkan run[cite: 2].
  * Tombol **Done** otomatis mengarsipkan Party Member dan membuat thread *Salary Panel* baru di channel khusus[cite: 2].

* **Salary & Earnings Panel (`/set-salary`)**
  * Pencatatan *item loot* di trading house (Belum Laku & Sudah Laku) dengan rekomendasi katalog otomatis (*autocomplete*)[cite: 2].
  * Pencatatan pinjaman *Sealstamp Loan* dengan harga seal stamp yang bisa di kustomisasi[cite: 2].
  * Pencatatan *Gold Drops* tambahan[cite: 2].
  * Kalkulasi otomatis: Pajak/fee penjual barang (2%), kompensasi stamp, dan pembagian gaji pokok rata ke 8 player[cite: 2].
  * Checklist pelunasan gaji (**Mark Paid**) dengan multi-select dropdown[cite: 2].
  * Fitur penunjukan **Co-Host** untuk membantu pengelolaan panel[cite: 2].

---

## 🛠️ Slash Commands

| Command | Deskripsi | Permission |
| :--- | :--- | :--- |
| `/createparty [title]` | Membuat panel rekrutmen party baru[cite: 2] | Semua Member |
| `/set-salary [title]` | Membuat panel perhitungan gaji baru secara manual[cite: 2] | Semua Member / Host |
| `/set-salary-channel [channel]` | Mengatur channel tujuan pembuatan thread hasil party selesai[cite: 2] | Administrator / Manage Guild[cite: 2] |
| `/add-item [name] [qty] [price]` | Menambahkan item loot ke panel salary aktif di channel/thread[cite: 2] | Host / Co-Host[cite: 2] |

---

## ⚙️ Environment Variables

Buat file `.env` di lokal atau tambahkan di tab **Variables** Railway:

```env
DISCORD_TOKEN=token_bot_kamu
CLIENT_ID=client_id_aplikasi_discord
RAILWAY_VOLUME_MOUNT_PATH=/app/data
NODE_OPTIONS=--max-old-space-size=60
