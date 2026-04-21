async function loadModules() {
  const container = document.getElementById("modules");
  const status = document.getElementById("status");

  try {
    const res = await fetch("./config/modules.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Cannot load modules.json");
    const modules = await res.json();

    container.innerHTML = modules.map((m) => `
      <article class="card">
        <span class="pill">${m.status}</span>
        <h3>${m.name}</h3>
        <p>${m.description}</p>
        <a class="btn" href="${m.path}">เปิดโมดูล</a>
      </article>
    `).join("");

    status.textContent = `พร้อมใช้งาน ${modules.length} โมดูล`;
  } catch (err) {
    status.textContent = "โหลดโมดูลไม่สำเร็จ";
    container.innerHTML = `
      <article class="card">
        <h3>ยังไม่พบรายการโมดูล</h3>
        <p>ตรวจสอบไฟล์ app/config/modules.json อีกครั้ง</p>
      </article>
    `;
  }
}

loadModules();
