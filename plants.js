fetch('http://localhost:3000/api/indoor-plants')
  .then(res => res.json())
  .then(plants => {
    const grid = document.getElementById('indoorGrid');
    plants.forEach(plant => {
      const card = document.createElement('div');
      card.className = 'grid-item';
      card.innerHTML = `
        <img src="${plant.Image}" alt="${plant['Common name']}">
        <h3>${plant['Common name']} <br><small>(${plant['Scientific name']})</small></h3>
      `;
      card.addEventListener('click', () => showPlantDetails(plant));
      grid.appendChild(card);
    });
  });

function showPlantDetails(plant) {
  alert(`${plant['Common name']} (${plant['Scientific name']})\n\n${plant.Description || 'No additional details.'}`);
}
