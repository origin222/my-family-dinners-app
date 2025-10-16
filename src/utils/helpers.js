// src/utils/helpers.js

export const convertToActualTime = (targetTimeStr, minutesBefore) => {
    if (!targetTimeStr) return 'N/A';
    const [hours, minutes] = targetTimeStr.split(':').map(Number);
    const targetDate = new Date();
    targetDate.setHours(hours, minutes, 0, 0);
    const startTime = new Date(targetDate.getTime() - minutesBefore * 60000);
    const h = startTime.getHours();
    const m = startTime.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    const minute = m < 10 ? '0' + m : m;
    return `${hour}:${minute} ${ampm}`;
};

export const mergeShoppingLists = (newShoppingList, oldShoppingList) => {
    if (!oldShoppingList) return newShoppingList;
    const oldListMap = new Map();
    oldShoppingList.forEach(item => {
        const key = `${item.item}|${item.quantity}|${item.category}`;
        oldListMap.set(key, item.isChecked);
    });
    return newShoppingList.map(newItem => {
        const key = `${newItem.item}|${newItem.quantity}|${newItem.category}`;
        const wasChecked = oldListMap.get(key);
        return { ...newItem, isChecked: wasChecked === true };
    });
};

export const convertIngredient = (ingredientString, targetUnit) => {
    if (!ingredientString) return { original: 'N/A', converted: 'N/A' };
    const parts = ingredientString.toLowerCase().match(/(\d+\.?\d*)\s*([a-z]+)/);
    if (!parts) return { original: ingredientString, converted: ingredientString };
    const value = parseFloat(parts[1]);
    const unit = parts[2].trim();
    const UNIT_CONVERSIONS = {
        'lb': { unit: 'kg', factor: 0.453592 },
        'oz': { unit: 'g', factor: 28.3495 },
        'cup': { unit: 'ml', factor: 236.588 },
        'tsp': { unit: 'ml', factor: 4.92892 },
        'tbsp': { unit: 'ml', factor: 14.7868 }
    };
    if (targetUnit === 'metric') {
        const conversion = UNIT_CONVERSIONS[unit];
        if (conversion) {
            const newValue = value * conversion.factor;
            return { original: `${value} ${unit}`, converted: `${newValue.toFixed(1)} ${conversion.unit}` };
        }
    }
    return { original: ingredientString, converted: "N/A" };
};