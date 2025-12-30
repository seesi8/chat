import React, { useContext } from 'react';
import { UserContext } from '../lib/context';
import Image from 'next/image';

export default function ProfileImage({src, width = 10, height = 10}) {
    return (
        <div className={`rounded-full overflow-hidden bg-white w-${width} h-${height} flex justify-center flex-shrink-0 items-center relative`}>
            <Image
                src={src}
                layout="fill"
                objectFit="cover"
            />
        </div>
    );
}