import { Platform } from '../lib/connection';
import { ComponentType, PropertyDataType } from '../lib/type';

async function main() {
    const plat = new Platform('BOT-91JK113', 'martas', 'RGB Světlo');
    const nodeLight = plat.addNode('light', 'RGB Světlo', ComponentType.switch);
    nodeLight.addProperty({
        propertyId: 'power',
        dataType: PropertyDataType.boolean,
        name: 'Světlo',
        settable: true,
    });

    nodeLight.addProperty({
        propertyId: 'color',
        dataType: PropertyDataType.color,
        name: 'Barva',
        settable: true,
    });

    nodeLight.addProperty({
        propertyId: 'bright',
        dataType: PropertyDataType.integer,
        format: '0:100',
        name: 'Jas',
        settable: true,
    });

    plat.init();
}

main();
