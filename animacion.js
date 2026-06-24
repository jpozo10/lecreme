document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector(".lc-main-header");

    window.addEventListener("scroll", () => {
        if(window.scrollY > 80){
            header.classList.add("shrink");
            header.classList.remove("expanded");
        }else{
            header.classList.add("expanded");
            header.classList.remove("shrink");
        }
    });
});