import React from 'react'

export default function Icon() {
    return (
        <div style={ {
            width: 'auto',
            height: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            objectFit: 'contain'
        } }>
            <img
                src="/icon.png"
                alt="Logo Icon"
                style={ {
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain'
                } }
            />
        </div>
    )
}
