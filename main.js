document.addEventListener('DOMContentLoaded', (event) => {
    let balance = document.getElementById('balance');
    let remaining = document.getElementById('remaining');
    let icon = document.getElementById('icon');
    let count = parseInt(remaining.textContent, 10);
    let isClickable = true;
  
    function updateBalance(addValue) {
      if (isClickable && count >= addValue) {
        let currentBalance = parseInt(balance.textContent, 10);
        balance.textContent = currentBalance + addValue;
        count -= addValue;
        remaining.textContent = count;
        for (let i = 0; i < addValue; i++) {
          animateNumber();
         
        }
      }
      if (count === 0) {
        isClickable = false;
        setTimeout(() => {
          isClickable = true;
          count = 1000;
          remaining.textContent = count;
        }, 3600000); // 1 hour in milliseconds
      }
    }
  
    function animateNumber() {
      let number = document.createElement('h5');
      number.textContent = '1';
      number.style.position = 'absolute';
      number.style.left = icon.getBoundingClientRect().center + 'px';
      number.style.top = icon.getBoundingClientRect().top + 'px';
      document.body.appendChild(number);
  
      let moveUp = setInterval(() => {
        let currentTop = parseInt(number.style.top, 10);
        number.style.top = (currentTop - 1) + 'px';
      }, 10);
  
      setTimeout(() => {
        clearInterval(moveUp);
        number.style.opacity = '0';
        setTimeout(() => document.body.removeChild(number), 2000);
      }, 1000);
    }
  
    icon.addEventListener('click', (e) => {
      e.preventDefault();
      updateBalance(1);
    });
  
    icon.addEventListener('touchstart', (e) => {
      e.preventDefault();
      let touchCount = e.touches.length;
      updateBalance(touchCount);
    });
  });
  