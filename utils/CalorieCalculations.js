// backend/utils/calculations.js

// Funcția pentru a standardiza scopul (targetul de fitness)
// Acum va primi string-uri ca "Lose weight", "Maintain current weight", "Gain muscle"
// și le va transforma în "lose", "keep", "gain" - dar simplificat
export function convertGoal(rawGoalString) {
  if (typeof rawGoalString !== "string") {
    console.warn(
      "Backend: convertGoal received non-string input:",
      rawGoalString
    );
    return "keep"; // Implicit la "keep" dacă input-ul nu e valid
  }

  // Folosim direct string-urile din quiz
  if (rawGoalString === "Lose weight") {
    return "lose";
  }
  if (rawGoalString === "Gain muscle") {
    return "gain";
  }
  if (rawGoalString === "Maintain current weight") {
    return "keep";
  }
  return "keep"; // Fallback
}


export function calculateCalories(userDataForCalc) {
  const { age, height, weight, gender, goal } = userDataForCalc; 

  let bmr;
  const numHeight = parseFloat(height);
  const numWeight = parseFloat(weight);
  const numAge = parseInt(age);

  // Verificări de validitate
  if (isNaN(numAge) || isNaN(numHeight) || isNaN(numWeight)) {
    console.error(
      "Backend: calculateCalories received non-numeric age, height, or weight."
    );
    return 0;
  }

  // Calculul BMR (Mifflin-St Jeor Equation)
  if (gender && gender.toLowerCase() === "male") {
    bmr = 10 * numWeight + 6.25 * numHeight - 5 * numAge + 5;
  } else {
    bmr = 10 * numWeight + 6.25 * numHeight - 5 * numAge - 161;
  }

  // Ajustăm caloriile în funcție de scopul standardizat
  // Folosim `convertGoal` pentru a standardiza string-ul exact ca în quiz
  const standardizedGoal = convertGoal(goal);

  if (standardizedGoal === "lose") {
    return Math.round(bmr * 0.8); // 20% deficit
  } else if (standardizedGoal === "gain") {
    return Math.round(bmr * 1.2); // 20% surplus
  } else {
    return Math.round(bmr); // "keep" sau alte valori non-standard
  }
}
