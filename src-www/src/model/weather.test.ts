import { describe, expect, it } from 'vitest';
import { findWeatherChannels, interpretWeather, parseWindDirection } from './weather';

const deg = (r?: number) => (r === undefined ? undefined : Math.round((r * 180) / Math.PI));

describe('weather from daswetter', () => {
    it('reads light and heavy rain, snow by name or frost, sleet', () => {
        const light = interpretWeather({ symbol_description: 'Leichter Regen bei bewölktem Himmel', clouds: 80, rain: 0.4, temperature: 9 });
        expect(light.rain).toBeCloseTo(0.3);
        expect(light.snow).toBe(0);
        expect(light.clouds).toBeCloseTo(0.85);
        const heavy = interpretWeather({ symbol_description: 'Heavy rain', rain: 6 });
        expect(heavy.rain).toBe(1);
        const snow = interpretWeather({ symbol_description: 'Starker Schneefall', rain: 2, temperature: -3 });
        expect(snow.snow).toBe(1);
        expect(snow.rain).toBe(0);
        // precipitation at frost without a description is snow
        expect(interpretWeather({ rain: 1, temperature: -1, clouds: 100 }).snow).toBeGreaterThan(0);
        const sleet = interpretWeather({ symbol_description: 'Regen und Schnee', rain: 1 });
        expect(sleet.rain).toBeGreaterThan(0);
        expect(sleet.snow).toBeGreaterThan(0);
    });

    it('reads thunderstorms, fog and clear skies', () => {
        expect(interpretWeather({ symbol_description: 'Gewitter mit Hagel', rain: 3 }).thunder).toBe(true);
        expect(interpretWeather({ symbol_description: 'Dichter Nebel' }).fog).toBeCloseTo(0.9);
        expect(interpretWeather({ symbol_description: 'Mist' }).fog).toBeCloseTo(0.6);
        const clear = interpretWeather({ symbol_description: 'Klarer Himmel', clouds: 0, rain: 0, wind_speed: 9, wind_direction: 'SW', night: true });
        expect(clear.rain + clear.snow + clear.fog).toBe(0);
        expect(clear.thunder).toBe(false);
        expect(deg(clear.windFrom)).toBe(225);
        expect(clear.night).toBe(true);
    });

    it('parses wind directions in German and English', () => {
        expect(deg(parseWindDirection('NO'))).toBe(45);
        expect(deg(parseWindDirection('NE'))).toBe(45);
        expect(deg(parseWindDirection('WSW'))).toBe(248);
        expect(deg(parseWindDirection('Süd'))).toBe(180);
        expect(deg(parseWindDirection('Nordwest'))).toBe(315);
        expect(deg(parseWindDirection(90))).toBe(90);
        expect(parseWindDirection('')).toBeUndefined();
    });

    it('finds the hour channels, preferring the current hour', () => {
        const ids = [
            'daswetter.0.location_1.ForecastHourly.Hour_1.clouds',
            'daswetter.0.location_1.ForecastHourly.Hour_2.clouds',
            'daswetter.0.location_1.ForecastHourly.Current.clouds',
            'daswetter.0.location_1.ForecastDaily.Day_1.Rain',
        ];
        expect(findWeatherChannels(ids)).toEqual(['daswetter.0.location_1.ForecastHourly.Current', 'daswetter.0.location_1.ForecastHourly.Hour_1']);
    });
});
